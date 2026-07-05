import { gameState } from './GameState';

export type BgmKey = 'title' | 'field';

interface BgmTrack {
  stepSec: number;
  leadType: OscillatorType;
  bassType: OscillatorType;
  leadVol: number;
  bassVol: number;
  /** 0이면 하이햇 없음 */
  hatVol: number;
  /** 0 = 쉼표 */
  lead: ReadonlyArray<number>;
  bass: ReadonlyArray<number>;
}

/** 아주 짧은 무음 WAV — iOS 무음 스위치 대응용 (런타임 생성이라 자산 파일 불필요) */
function buildSilentWavUrl(): string {
  const sampleRate = 8000;
  const samples = 800; // 0.1초
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const writeStr = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, 'data');
  v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/** 샤워장 노래 실음원 (1.25배속 + 욕실 리버브 가공본) */
const SONG_URL = '/audio/shower-song.mp3';

/**
 * Web Audio 기반 사운드 매니저 (싱글턴).
 * SFX/BGM은 신디사이저로 즉석 생성, 샤워장 노래는 실음원(mp3)을
 * AudioBuffer로 디코드해 재생한다 (마스터 게인/음소거/일시정지 통합).
 * 음원 로드가 안 된 환경(오프라인 첫 방문 등)에서는 칩튠 루프로 폴백.
 */
class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  // 노래 상태 — 실음원 버퍼 재생 + 칩튠 폴백
  private songTimer: number | null = null; // 칩튠 폴백 스케줄러
  private songNextTime = 0;
  private songStep = 0;
  private songPlaying = false;
  private songMode: 'buffer' | 'chip' = 'chip';
  private songData: ArrayBuffer | null = null;
  private songBuffer: AudioBuffer | null = null;
  private songDecodePending = false;
  private songSource: AudioBufferSourceNode | null = null;
  private songOffsetSec = 0;
  private songStartedAtSec = 0;

  // 샤워기 물소리 (필터 노이즈 루프)
  private showerSrc: AudioBufferSourceNode | null = null;
  private showerBuf: AudioBuffer | null = null;

  // BGM 루프 상태
  private bgmTimer: number | null = null;
  private bgmKey: BgmKey | null = null;
  private bgmStep = 0;
  private bgmNextTime = 0;

  // 심장박동 상태
  private heartbeatTimer: number | null = null;

  // iOS 무음 스위치 대응: 루프로 계속 재생해 두는 무음 <audio>
  private silentEl: HTMLAudioElement | null = null;
  private silentPlaying = false;

  // 좀비 컨텍스트 감지 (state는 running인데 시계가 멈춰 소리가 안 나는 iOS 버그)
  private zombieCheckPending = false;

  /**
   * 오디오 언락 리스너 설치 — 앱 시작 시 1회 호출.
   * iOS는 백그라운드 복귀·전화 인터럽트 후 AudioContext가 다시 잠기므로
   * once가 아니라 모든 제스처 + visibilitychange에서 재시도해야 한다.
   */
  installAutoUnlock(): void {
    const tryUnlock = (): void => this.unlock();
    window.addEventListener('pointerdown', tryUnlock, { passive: true });
    window.addEventListener('touchend', tryUnlock, { passive: true });
    window.addEventListener('keydown', tryUnlock);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // 탭/앱 전환 복귀 — resume 시도 + 시계가 멈춘 좀비 컨텍스트면 재생성
        this.resumeIfSuspended();
        this.resumeSilentLoop();
        this.scheduleZombieCheck();
      } else {
        // 백그라운드에서는 무음 루프를 쉬게 한다 (복귀 시 재개)
        this.silentEl?.pause();
        this.silentPlaying = false;
      }
    });
  }

  /** 사용자 제스처에서 호출 (모바일 autoplay 정책 대응) */
  unlock(): void {
    if (!this.ctx) {
      this.createContext();
    } else {
      this.scheduleZombieCheck();
    }
    this.resumeIfSuspended();
    this.ensureSilentLoop();
  }

  private createContext(): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.master.gain.value = gameState.settings.mute ? 0 : 1;
    this.lastCtxTime = -1;
    // 새 컨텍스트의 시계는 0부터 — 스케줄러 기준 시각을 리셋해야 루프가 되살아난다
    this.songNextTime = 0;
    this.bgmNextTime = 0;
    // 이전 컨텍스트에 묶여 있던 소스들은 함께 죽었다 — 다음 tick에서 재생성된다
    this.songSource = null;
    this.showerSrc = null;
    this.tryDecodeSong();
  }

  // ── 실음원 로드/디코드 ────────────────────────

  /** 앱 시작 시 1회 호출 — 노래 파일을 미리 받아 두고 컨텍스트가 생기면 디코드 */
  preloadSong(): void {
    if (this.songData || this.songBuffer) return;
    void fetch(SONG_URL)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buf) => {
        if (!buf) return;
        this.songData = buf;
        this.tryDecodeSong();
      })
      .catch(() => undefined); // 오프라인 등 — 칩튠 폴백으로 진행
  }

  private tryDecodeSong(): void {
    if (!this.ctx || !this.songData || this.songBuffer || this.songDecodePending) return;
    this.songDecodePending = true;
    // decodeAudioData가 버퍼를 detach하는 브라우저가 있어 사본을 넘긴다
    this.ctx.decodeAudioData(
      this.songData.slice(0),
      (decoded) => {
        this.songBuffer = decoded;
        this.songDecodePending = false;
      },
      () => {
        this.songDecodePending = false;
      }
    );
  }

  /**
   * iOS/사파리에서 앱·탭 전환 후 돌아오면 state는 'running'인데
   * currentTime이 멈춰 소리가 안 나는 좀비 상태가 될 수 있다.
   * 350ms 뒤에도 시계가 그대로면 컨텍스트를 즉시 새로 만든다.
   * (사운드가 전부 신스/버퍼 재생이라 재생성 비용이 없고,
   *  재생성 직후 suspended 상태여도 다음 제스처에서 자동 resume된다)
   */
  private scheduleZombieCheck(): void {
    if (this.zombieCheckPending || !this.ctx || this.ctx.state !== 'running') return;
    this.zombieCheckPending = true;
    const t0 = this.ctx.currentTime;
    window.setTimeout(() => {
      this.zombieCheckPending = false;
      if (!this.ctx || this.ctx.state !== 'running') return;
      if (this.ctx.currentTime === t0) {
        void this.ctx.close().catch(() => undefined);
        this.ctx = null;
        this.master = null;
        this.createContext();
        this.resumeIfSuspended();
      }
    }, 350);
  }

  private resumeIfSuspended(): void {
    if (!this.ctx) return;
    // iOS는 전화/시리 등 인터럽트 시 비표준 'interrupted' 상태가 된다
    const state = this.ctx.state as AudioContextState | 'interrupted';
    if (state === 'suspended' || state === 'interrupted') {
      void this.ctx.resume();
    }
  }

  /**
   * iOS에서 무음(진동) 스위치가 켜져 있으면 Web Audio가 통째로 음소거된다.
   * 무음 <audio>를 '루프로 계속' 재생해 두면 오디오 세션이 미디어 재생으로
   * 유지되어 Web Audio가 정상 출력된다 (unmute.js 패턴).
   * 일회성 재생은 끝나는 순간 세션을 회수당해 오히려 소리가 끊긴다 — 반드시 루프.
   */
  private ensureSilentLoop(): void {
    try {
      if (!this.silentEl) {
        const el = document.createElement('audio');
        el.setAttribute('playsinline', '');
        el.src = buildSilentWavUrl();
        el.loop = true;
        el.preload = 'auto';
        this.silentEl = el;
      }
      this.resumeSilentLoop();
    } catch {
      // 지원하지 않는 환경은 조용히 무시
    }
  }

  private resumeSilentLoop(): void {
    const el = this.silentEl;
    if (!el || this.silentPlaying) return;
    const p = el.play();
    if (p !== undefined) {
      this.silentPlaying = true;
      p.catch(() => {
        // 제스처 밖이면 실패할 수 있다 — 다음 제스처에서 재시도
        this.silentPlaying = false;
      });
    }
  }

  setMute(mute: boolean): void {
    if (this.master) this.master.gain.value = mute ? 0 : 1;
  }

  private get ready(): boolean {
    return this.ctx !== null && this.master !== null && this.ctx.state === 'running';
  }

  // ── 저수준 신스 헬퍼 ──────────────────────────

  private tone(
    type: OscillatorType,
    freq: number,
    startAt: number,
    dur: number,
    vol: number,
    freqEnd?: number
  ): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startAt);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), startAt + dur);
    }
    gain.gain.setValueAtTime(vol, startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
    osc.connect(gain).connect(this.master);
    osc.start(startAt);
    osc.stop(startAt + dur + 0.02);
  }

  private noiseBurst(startAt: number, dur: number, vol: number, filterFreq = 1000): void {
    if (!this.ctx || !this.master) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(startAt);
  }

  private get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ── SFX ──────────────────────────────────────

  /** 문 여는 소리 */
  door(): void {
    if (!this.ready) return;
    this.tone('sawtooth', 120, this.now, 0.25, 0.3, 60);
    this.noiseBurst(this.now, 0.15, 0.4, 500);
  }

  /** 전자레인지 "삐-" — 실제처럼 1초간 이어지는 고음 비프 (피에조 부저 느낌) */
  microwaveBeep(): void {
    if (!this.ready || !this.ctx || !this.master) return;
    const t = this.now;
    const beep = (freq: number, vol: number): void => {
      if (!this.ctx || !this.master) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      gain.gain.setValueAtTime(vol, t + 0.85);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + 1.05);
    };
    beep(2093, 0.3); // 기본음
    beep(4186, 0.05); // 배음 — 피에조 특유의 쨍한 질감
  }

  /** 카톡/알림 "띠링" */
  ding(): void {
    if (!this.ready) return;
    this.tone('sine', 987, this.now, 0.12, 0.4);
    this.tone('sine', 1318, this.now + 0.1, 0.25, 0.4);
  }

  /** 벽치기 "쿵" */
  thud(): void {
    if (!this.ready) return;
    this.tone('sine', 90, this.now, 0.25, 0.9, 40);
    this.noiseBurst(this.now, 0.1, 0.5, 200);
  }

  /** 타이머 째깍 */
  tick(): void {
    if (!this.ready) return;
    this.noiseBurst(this.now, 0.03, 0.35, 3000);
  }

  /** 성공 카운트 등 짧은 긍정 효과음 */
  chime(): void {
    if (!this.ready) return;
    this.tone('triangle', 659, this.now, 0.1, 0.35);
    this.tone('triangle', 880, this.now + 0.09, 0.18, 0.35);
  }

  /** 실수/페널티 */
  buzz(): void {
    if (!this.ready) return;
    this.tone('sawtooth', 160, this.now, 0.25, 0.35, 110);
  }

  /** 성공 팡파레 */
  fanfare(): void {
    if (!this.ready) return;
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => this.tone('square', f, this.now + i * 0.13, 0.22, 0.25));
    this.tone('square', 1046, this.now + 0.55, 0.5, 0.25);
  }

  /** 게임오버 스팅어 */
  gameover(): void {
    if (!this.ready) return;
    const notes = [440, 415, 392, 370];
    notes.forEach((f, i) => this.tone('sawtooth', f, this.now + i * 0.22, 0.3, 0.3));
    this.tone('sawtooth', 220, this.now + 0.9, 0.9, 0.35, 110);
  }

  /** 발각 순간 "쾅!" */
  caught(): void {
    if (!this.ready) return;
    this.noiseBurst(this.now, 0.35, 0.8, 800);
    this.tone('sawtooth', 100, this.now, 0.4, 0.6, 50);
  }

  // ── 심장박동 (Q5 정적 연출) ───────────────────

  startHeartbeat(): void {
    if (!this.ready || this.heartbeatTimer !== null) return;
    const beat = (): void => {
      if (!this.ready) return;
      this.tone('sine', 62, this.now, 0.12, 1.0, 45);
      this.tone('sine', 56, this.now + 0.16, 0.1, 0.75, 40);
    };
    beat();
    this.heartbeatTimer = window.setInterval(beat, 600);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── 노래 (Q1 샤워장) — 실음원 버퍼 재생, 미로드 시 칩튠 폴백 ─────────
  // startSong() 후 setSongPlaying(false/true)으로 일시정지/재개.

  private static readonly MELODY: ReadonlyArray<number> = [
    659, 587, 523, 587, 659, 659, 659, 0,
    587, 587, 587, 0, 659, 784, 784, 0,
    659, 587, 523, 587, 659, 659, 659, 659,
    587, 587, 659, 587, 523, 0, 523, 0,
  ];
  private static readonly STEP_SEC = 0.19;

  startSong(): void {
    this.stopSong();
    this.songPlaying = true;
    this.songOffsetSec = 0;
    // 시작 시점에 모드 고정 — 판 중간에 음원이 뒤바뀌는 어색함 방지
    this.songMode = this.songBuffer ? 'buffer' : 'chip';
    if (this.songMode === 'chip') {
      this.songStep = 0;
      this.songNextTime = this.now + 0.1;
      this.songTimer = window.setInterval(() => this.scheduleSong(), 60);
    } else {
      this.ensureSongState();
    }
  }

  setSongPlaying(playing: boolean): void {
    if (this.songPlaying === playing) {
      // 상태는 같아도 소스가 죽어 있을 수 있다 (언락 지연/컨텍스트 재생성) — self-heal
      this.ensureSongState();
      return;
    }
    this.songPlaying = playing;
    if (this.songMode === 'chip') {
      if (playing) {
        this.songNextTime = Math.max(this.songNextTime, this.now + 0.06);
      }
    } else {
      this.ensureSongState();
    }
  }

  /** 버퍼 모드의 재생 상태를 실제 소스 존재 여부와 일치시킨다 (일시정지 = 오프셋 기억) */
  private ensureSongState(): void {
    if (this.songMode !== 'buffer' || !this.songBuffer) return;
    const shouldPlay = this.songPlaying && this.ready;
    if (shouldPlay && !this.songSource && this.ctx && this.master) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.songBuffer;
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.9;
      src.connect(gain).connect(this.master);
      src.start(0, this.songOffsetSec % this.songBuffer.duration);
      this.songStartedAtSec = this.ctx.currentTime;
      this.songSource = src;
    } else if (!shouldPlay && this.songSource) {
      this.songOffsetSec += this.now - this.songStartedAtSec;
      try {
        this.songSource.stop();
      } catch {
        // 이미 정지된 소스는 무시
      }
      this.songSource.disconnect();
      this.songSource = null;
    }
  }

  stopSong(): void {
    if (this.songTimer !== null) {
      window.clearInterval(this.songTimer);
      this.songTimer = null;
    }
    this.songPlaying = false;
    this.songOffsetSec = 0;
    if (this.songSource) {
      try {
        this.songSource.stop();
      } catch {
        // 이미 정지된 소스는 무시
      }
      this.songSource.disconnect();
      this.songSource = null;
    }
  }

  // ── 샤워기 물소리 (필터 노이즈 루프) ──────────

  /** 호출 시점에 컨텍스트가 없으면 무시 — 매 프레임 불러도 안전 (self-heal) */
  startShowerNoise(): void {
    if (!this.ready || this.showerSrc || !this.ctx || !this.master) return;
    if (!this.showerBuf || this.showerBuf.sampleRate !== this.ctx.sampleRate) {
      const len = Math.floor(this.ctx.sampleRate * 2);
      this.showerBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.showerBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.showerBuf;
    src.loop = true;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 350;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.07;
    src.connect(hp).connect(lp).connect(gain).connect(this.master);
    src.start();
    this.showerSrc = src;
  }

  stopShowerNoise(): void {
    if (!this.showerSrc) return;
    try {
      this.showerSrc.stop();
    } catch {
      // 이미 정지된 소스는 무시
    }
    this.showerSrc.disconnect();
    this.showerSrc = null;
  }

  private scheduleSong(): void {
    if (!this.ready || !this.songPlaying) return;
    // 언락 전에 시작됐거나 탭 전환으로 밀린 경우 — 과거 스케줄은 현재로 재동기화 (몰아치기 방지)
    if (this.songNextTime < this.now - 0.05) this.songNextTime = this.now + 0.05;
    while (this.songNextTime < this.now + 0.25) {
      const melody = AudioManagerImpl.MELODY;
      const freq = melody[this.songStep % melody.length];
      if (freq > 0) {
        this.tone('square', freq, this.songNextTime, AudioManagerImpl.STEP_SEC * 0.9, 0.2);
        // 간단한 베이스 (한 옥타브 아래, 2스텝마다)
        if (this.songStep % 2 === 0) {
          this.tone('triangle', freq / 2, this.songNextTime, AudioManagerImpl.STEP_SEC * 0.8, 0.14);
        }
      }
      this.songStep += 1;
      this.songNextTime += AudioManagerImpl.STEP_SEC;
    }
  }

  // ── BGM (신스 루프 — 타이틀 행진곡 / 필드 잠입 루프) ─────────

  private static readonly BGM_TRACKS: Record<BgmKey, BgmTrack> = {
    // 늠름한 군가풍 행진곡 (C장조, 8분음표)
    title: {
      stepSec: 0.24,
      leadType: 'square',
      bassType: 'triangle',
      leadVol: 0.11,
      bassVol: 0.08,
      hatVol: 0,
      lead: [
        523, 0, 659, 0, 784, 0, 659, 0,
        698, 0, 659, 0, 587, 0, 659, 0,
        523, 0, 659, 0, 784, 0, 880, 0,
        784, 0, 659, 0, 523, 0, 0, 0,
      ],
      bass: [
        131, 0, 196, 0, 131, 0, 196, 0,
        147, 0, 220, 0, 131, 0, 196, 0,
        131, 0, 196, 0, 175, 0, 220, 0,
        196, 0, 165, 0, 131, 0, 98, 0,
      ],
    },
    // 살금살금 긴장 루프 (A단조 스타카토) — SFX를 가리지 않게 작게
    field: {
      stepSec: 0.21,
      leadType: 'square',
      bassType: 'triangle',
      leadVol: 0.07,
      bassVol: 0.055,
      hatVol: 0.014,
      lead: [
        330, 0, 0, 392, 330, 0, 311, 0,
        330, 0, 0, 392, 440, 0, 392, 0,
        330, 0, 0, 392, 330, 0, 311, 0,
        294, 0, 311, 0, 330, 0, 0, 0,
      ],
      bass: [
        110, 0, 165, 0, 110, 0, 165, 0,
        110, 0, 165, 0, 147, 0, 165, 0,
        110, 0, 165, 0, 110, 0, 165, 0,
        98, 0, 147, 0, 110, 0, 110, 0,
      ],
    },
  };

  /** BGM 시작 — 같은 트랙이 이미 흐르고 있으면 그대로 유지 */
  startBgm(key: BgmKey): void {
    if (this.bgmKey === key && this.bgmTimer !== null) return;
    this.stopBgm();
    this.bgmKey = key;
    this.bgmStep = 0;
    this.bgmNextTime = this.now + 0.15;
    this.bgmTimer = window.setInterval(() => this.scheduleBgm(), 80);
  }

  stopBgm(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    this.bgmKey = null;
  }

  private scheduleBgm(): void {
    if (!this.ready || !this.bgmKey) return;
    const t = AudioManagerImpl.BGM_TRACKS[this.bgmKey];
    // 언락 전에 시작된 경우 등 — 과거로 밀린 스케줄은 현재로 재동기화 (몰아치기 방지)
    if (this.bgmNextTime < this.now - 0.05) this.bgmNextTime = this.now + 0.05;
    while (this.bgmNextTime < this.now + 0.3) {
      const i = this.bgmStep % t.lead.length;
      const lf = t.lead[i];
      const bf = t.bass[i % t.bass.length];
      if (lf > 0) this.tone(t.leadType, lf, this.bgmNextTime, t.stepSec * 0.85, t.leadVol);
      if (bf > 0) this.tone(t.bassType, bf, this.bgmNextTime, t.stepSec * 0.9, t.bassVol);
      if (t.hatVol > 0 && i % 2 === 0) {
        this.noiseBurst(this.bgmNextTime, 0.03, t.hatVol, 6000);
      }
      this.bgmStep += 1;
      this.bgmNextTime += t.stepSec;
    }
  }

  /** 씬 전환 등에서 흘러나오는 소리 정리 */
  stopAll(): void {
    this.stopSong();
    this.stopShowerNoise();
    this.stopHeartbeat();
    this.stopBgm();
  }
}

export const audio = new AudioManagerImpl();
