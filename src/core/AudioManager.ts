import { gameState } from './GameState';

/**
 * Web Audio 기반 사운드 매니저 (싱글턴).
 * 모든 SFX는 신디사이저로 즉석 생성 — 외부 오디오 파일 불필요.
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

  // 심장박동 상태
  private heartbeatTimer: number | null = null;

  /** 첫 사용자 제스처에서 호출 (모바일 autoplay 정책 대응) */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.master.gain.value = gameState.settings.mute ? 0 : 1;
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
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

  /** 씬 전환 등에서 흘러나오는 소리 정리 */
  stopAll(): void {
    this.stopSong();
    this.stopHeartbeat();
  }
}

export const audio = new AudioManagerImpl();
