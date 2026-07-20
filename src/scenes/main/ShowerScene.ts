import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q1_SHOWER } from '../../config';
import { audio } from '../../core/AudioManager';
import { Button } from '../../ui/Button';
import { Cadet } from '../../ui/Characters';
import { addSceneBg, addVignette } from '../../ui/Scenery';
import { chance, randFloat, randRange } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

const DOOR_X = GAME_WIDTH - 95;
const CURTAIN_X = 430;

type SeniorSpot = 'door' | 'curtain';

/**
 * Q1. 샤워장에서 몰래 노래 틀기.
 * 노래는 기본 재생 — [⏸] 버튼을 누르고 있는 동안만 멈춘다 (몰래춤추기의 반전 구조).
 * 선배는 예고 없이 정문 또는 옆 칸 커튼 중 무작위 위치에서 갑자기 나타난다.
 * 등장 순간의 짧은 반응 유예(reactMs) 안에 버튼을 누르지 못하면 발각. 선배가 나갈 때까지 홀드 유지.
 */
export class ShowerScene extends BaseMainScene {
  private holding = false;
  private seniorState: 'away' | 'in' = 'away';
  private reacted = false;
  private seniorSpot: SeniorSpot = 'door';
  private songProgressMs = 0;
  private showerRemainMs = 1;
  private songMs = 1;
  private showerTotalMs = 1;

  private player!: Cadet;
  private senior!: Cadet;
  private songFill!: Phaser.GameObjects.Graphics;
  private timeFill!: Phaser.GameObjects.Graphics;
  private noteTimer!: Phaser.Time.TimerEvent;

  constructor() {
    super({ key: 'shower' });
  }

  /** 몰래 트는 노래 자체가 게임플레이 — BGM은 끈다 */
  protected bgmTrack(): null {
    return null;
  }

  create(): void {
    this.holding = false;
    this.seniorState = 'away';
    this.songProgressMs = 0;
    this.songMs = Q1_SHOWER.songMs;

    // 샤워장 배경 (생성 이미지)
    addSceneBg(this, 'bg_shower');
    const water = this.add.particles(150, 420, '__WHITE', {
      speedY: { min: 300, max: 420 },
      speedX: { min: -20, max: 20 },
      scale: { start: 0.12, end: 0.05 },
      alpha: { start: 0.5, end: 0 },
      lifespan: 900,
      quantity: 2,
      tint: 0x9ad4f5,
    });
    void water;

    this.player = new Cadet(this, 210, 700, 'player');
    this.player.setFace('🎵');
    this.player.setMotion('dance');

    // 샤워 중이라 몸은 김에 가려진다 (옷 입고 씻는 것처럼 보이지 않게)
    const veil = this.add.graphics().setDepth(7);
    veil.fillStyle(0xeaf7fa, 0.38);
    veil.fillEllipse(210, 800, 280, 230);
    veil.fillStyle(0xeaf7fa, 0.26);
    veil.fillEllipse(210, 690, 240, 190);
    this.add
      .particles(210, 760, '__WHITE', {
        x: { min: -80, max: 80 },
        y: { min: -70, max: 70 },
        speedY: { min: -26, max: -8 },
        scale: { start: 2.6, end: 4.6 },
        alpha: { start: 0.3, end: 0 },
        lifespan: 2200,
        frequency: 80,
        tint: 0xeaf7fa,
      })
      .setDepth(7);

    // 수증기
    this.add.particles(0, 0, '__WHITE', {
      x: { min: 80, max: 640 },
      y: 840,
      speedY: { min: -18, max: -40 },
      speedX: { min: -8, max: 8 },
      scale: { start: 2.2, end: 3.8 },
      alpha: { start: 0.05, end: 0 },
      lifespan: 3600,
      frequency: 420,
      tint: 0xdff4f6,
    });
    addVignette(this, 0.2);

    this.senior = new Cadet(this, DOOR_X, 700, 'senior');
    this.senior.setVisible(false).setDepth(6);

    // 노래 진행 바
    const songBarBg = this.add.graphics();
    songBarBg.fillStyle(0x000000, 0.55);
    songBarBg.fillRoundedRect(GAME_WIDTH / 2 - 250, 70, 500, 42, 10);
    this.songFill = this.add.graphics();
    this.add
      .text(GAME_WIDTH / 2, 91, '🎵 노래 진행', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.textCss,
      })
      .setOrigin(0.5)
      .setDepth(10);

    // 샤워 시간 바
    const timeBarBg = this.add.graphics();
    timeBarBg.fillStyle(0x000000, 0.55);
    timeBarBg.fillRoundedRect(GAME_WIDTH / 2 - 250, 126, 500, 34, 10);
    this.timeFill = this.add.graphics();
    this.add
      .text(GAME_WIDTH / 2, 143, '⏱ 남은 샤워 시간', {
        fontFamily: FONT,
        fontSize: '22px',
        color: COLORS.textCss,
      })
      .setOrigin(0.5)
      .setDepth(10);

    // 홀드 버튼
    new Button(this, GAME_WIDTH / 2, GAME_HEIGHT - 190, {
      label: '⏸ 숨죽이기 (꾹)',
      width: 480,
      height: 150,
      color: COLORS.accent,
      fontSize: 40,
      onDown: () => {
        this.holding = true;
        this.player.setFace('😗');
        this.player.setMotion('idle');
      },
      onUp: () => {
        this.holding = false;
        this.player.setFace('🎵');
        this.player.setMotion('dance');
      },
    });
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 90, '누르는 동안 노래 정지 · 선배가 나갈 때까지 유지!', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5);

    this.setupCommon();
    this.showerTotalMs = Q1_SHOWER.showerTimeMs(this.day);
    this.showerRemainMs = this.showerTotalMs;

    // 떠다니는 음표 연출
    this.noteTimer = this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (this.holding || this.finished) return;
        const note = this.add
          .text(210 + Math.random() * 120 - 60, 560, '♪', {
            fontFamily: FONT,
            fontSize: '38px',
            color: '#ffd9e2',
          })
          .setOrigin(0.5);
        this.tweens.add({
          targets: note,
          y: 460,
          alpha: 0,
          duration: 1200,
          onComplete: () => note.destroy(),
        });
      },
    });
    void this.noteTimer;

    // 실음원(1.25배속 + 욕실 리버브) 재생 — 미로드 시 칩튠 폴백
    audio.startSong();
    // 샤워기 물소리는 노래 일시정지 중에도 계속 흐른다
    audio.startShowerNoise();

    this.startSeniorLoop({
      params: () => ({
        gapMs: randRange(Q1_SHOWER.gapMsRange(this.day)),
        stayMs: randRange(Q1_SHOWER.stayMsRange(this.day)),
      }),
      onEnter: () => {
        this.seniorState = 'in';
        this.reacted = false;
        this.seniorSpot = chance(0.5) ? 'door' : 'curtain';
        // 변칙 등장 — 가까이(크게) 또는 멀리(작게), 위치도 살짝 흔들린다
        const near = chance(0.5);
        const scale = near ? randFloat(1.0, 1.2) : randFloat(0.75, 0.9);
        const x = (this.seniorSpot === 'door' ? DOOR_X : CURTAIN_X) + randFloat(-24, 24);
        this.senior.setPosition(x, near ? 724 : 664).setScale(scale);
        this.senior.setVisible(true);
        // 옆 칸 커튼 쪽은 더 가깝지만, 반응창은 터치 반응 한계(360ms) 밑으로 안 내려간다
        const reactMs = Math.max(
          360,
          Q1_SHOWER.reactMs(this.day) * (this.seniorSpot === 'curtain' ? 0.7 : 1)
        );
        this.time.delayedCall(reactMs, () => {
          if (this.finished || this.seniorState !== 'in') return;
          if (this.holding) {
            this.reacted = true;
          } else {
            this.failCaught(this.senior, '반응이 늦었다! 노랫소리를 들켰다.');
          }
        });
      },
      onLeave: () => {
        this.seniorState = 'away';
        this.senior.setVisible(false);
      },
    });
  }

  protected tick(delta: number): void {
    this.showerRemainMs -= delta;
    if (this.showerRemainMs <= 0) {
      this.fail('노래를 다 듣기 전에 샤워 시간이 끝나버렸다...');
      return;
    }

    const playing = !this.holding;
    audio.setSongPlaying(playing && !this.finished);
    // 오디오 언락이 늦었어도 물소리가 뒤늦게라도 흐르도록 (내부 가드로 매 프레임 안전)
    audio.startShowerNoise();
    if (playing) {
      this.songProgressMs += delta;
      if (this.songProgressMs >= this.songMs) {
        this.succeed('노래를 끝까지 들었다! 오늘의 낭만 완수.');
        return;
      }
    }

    // 반응에 성공해 숨은 뒤, 선배가 있는 동안 손을 떼면 발각
    if (this.seniorState === 'in' && this.reacted && !this.holding) {
      this.failCaught(this.senior, '선배 앞에서 노래가 다시 흘러나왔다...!');
      return;
    }

    const songRatio = Math.min(1, this.songProgressMs / this.songMs);
    this.songFill.clear();
    this.songFill.fillStyle(COLORS.accent, 1);
    this.songFill.fillRoundedRect(GAME_WIDTH / 2 - 244, 76, 488 * songRatio, 30, 7);

    const timeRatio = Math.max(0, this.showerRemainMs / this.showerTotalMs);
    this.timeFill.clear();
    this.timeFill.fillStyle(timeRatio < 0.25 ? COLORS.warn : 0x4a90d9, 1);
    this.timeFill.fillRoundedRect(GAME_WIDTH / 2 - 244, 131, 488 * timeRatio, 24, 6);
  }
}
