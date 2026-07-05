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

/**
 * Web Audio 기반 사운드 매니저 (싱글턴).
 * 모든 SFX/BGM은 신디사이저로 즉석 생성 — 외부 오디오 파일 불필요.
 * 「차는 두고 가」 음원은 사용자가 제공하기 전까지 자체 칩튠 루프로 대체:
 * 실제 음원이 준비되면 startSong()만 <audio> 기반 구현으로 교체하면 된다 (키 추상화).
 */
class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  // 칩튠 루프 상태
  private songTimer: number | null = null;
  private songNextTime = 0;
  private songStep = 0;
  private songPlaying = false;

  // BGM 루프 상태
  private bgmTimer: number | null = null;
  private bgmKey: BgmKey | null = null;
  private bgmStep = 0;
  private bgmNextTime = 0;

  // 심장박동 상태
  private heartbeatTimer: number | null = null;

  // iOS 무음 스위치 대응 상태
  private silentKicked = false;

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
      if (document.visibilityState === 'visible') this.resumeIfSuspended();
    });
  }

  /** 사용자 제스처에서 호출 (모바일 autoplay 정책 대응) */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.master.gain.value = gameState.settings.mute ? 0 : 1;
    }
    this.resumeIfSuspended();
    this.kickSilentMedia();
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
   * 사용자 제스처 안에서 짧은 무음 <audio>를 한 번 재생하면 오디오 세션이
   * '미디어 재생' 카테고리로 승격되어 이후 Web Audio 소리가 정상 출력된다.
   */
  private kickSilentMedia(): void {
    if (this.silentKicked) return;
    try {
      const el = document.createElement('audio');
      el.setAttribute('playsinline', '');
      el.src = buildSilentWavUrl();
      el.volume = 0.01;
      const p = el.play();
      if (p !== undefined) {
        this.silentKicked = true;
        p.catch(() => {
          // 제스처 밖에서 불렸으면 실패 — 다음 제스처에서 재시도
          this.silentKicked = false;
        });
      }
    } catch {
      // 지원하지 않는 환경은 조용히 무시
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

  /** 전자레인지 "삐-" */
  microwaveBeep(): void {
    if (!this.ready) return;
    for (let i = 0; i < 3; i++) {
      this.tone('square', 2093, this.now + i * 0.45, 0.3, 0.25);
    }
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

  // ── 노래 (플레이스홀더 칩튠 루프) ─────────────
  // Q1에서 사용: startSong() 후 setSongPlaying(false/true)으로 일시정지/재개.

  private static readonly MELODY: ReadonlyArray<number> = [
    659, 587, 523, 587, 659, 659, 659, 0,
    587, 587, 587, 0, 659, 784, 784, 0,
    659, 587, 523, 587, 659, 659, 659, 659,
    587, 587, 659, 587, 523, 0, 523, 0,
  ];
  private static readonly STEP_SEC = 0.19;

  startSong(): void {
    if (!this.ready || this.songTimer !== null) return;
    this.songStep = 0;
    this.songPlaying = true;
    this.songNextTime = this.now + 0.1;
    this.songTimer = window.setInterval(() => this.scheduleSong(), 60);
  }

  setSongPlaying(playing: boolean): void {
    if (this.songPlaying === playing) return;
    this.songPlaying = playing;
    if (playing) {
      this.songNextTime = Math.max(this.songNextTime, this.now + 0.06);
    }
  }

  stopSong(): void {
    if (this.songTimer !== null) {
      window.clearInterval(this.songTimer);
      this.songTimer = null;
    }
    this.songPlaying = false;
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
    this.stopHeartbeat();
    this.stopBgm();
  }
}

export const audio = new AudioManagerImpl();
