import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q1_SHOWER } from '../../config';
import { audio } from '../../core/AudioManager';
import { Button } from '../../ui/Button';
import { Cadet } from '../../ui/Characters';
import {
  addVignette,
  drawAreaSign,
  drawCeilingLight,
  drawSkyGradient,
} from '../../ui/Scenery';
import { chance, randRange } from '../../utils/rng';
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

  create(): void {
    this.holding = false;
    this.seniorState = 'away';
    this.songProgressMs = 0;
    this.songMs = Q1_SHOWER.songMs;

    // 애니풍 샤워장 — 민트 타일 벽 + 젖은 바닥
    const WALL_B = 800;
    drawSkyGradient(this, 0, 0, GAME_WIDTH, 350, 0xd9f1f3, 0xc2e6ea);
    const bg = this.add.graphics();
    bg.fillStyle(0x4f93a8, 1);
    bg.fillRect(0, 350, GAME_WIDTH, 26);
    bg.fillGradientStyle(0xaddce2, 0xaddce2, 0x8fc3cf, 0x8fc3cf, 1);
    bg.fillRect(0, 376, GAME_WIDTH, WALL_B - 376);
    // 타일 줄눈
    bg.lineStyle(2, 0xffffff, 0.28);
    for (let x = 0; x <= GAME_WIDTH; x += 80) bg.lineBetween(x, 0, x, WALL_B);
    for (let y = 60; y < WALL_B; y += 66) bg.lineBetween(0, y, GAME_WIDTH, y);
    // 젖은 바닥
    bg.fillGradientStyle(0x7fb2c0, 0x7fb2c0, 0x51798c, 0x51798c, 1);
    bg.fillRect(0, WALL_B, GAME_WIDTH, GAME_HEIGHT - WALL_B);
    bg.lineStyle(2, 0xffffff, 0.1);
    for (let i = 0; i < 5; i++) bg.lineBetween(0, WALL_B + 40 + i * 95, GAME_WIDTH, WALL_B + 40 + i * 95);
    // 물기 반사 + 배수구
    bg.fillStyle(0xffffff, 0.08);
    bg.fillEllipse(220, 960, 300, 40);
    bg.fillEllipse(520, 1120, 260, 36);
    bg.fillStyle(0x3c5b6b, 1);
    bg.fillEllipse(360, 1040, 66, 22);
    bg.lineStyle(2, 0x2c4553, 1);
    bg.lineBetween(340, 1036, 380, 1036);
    bg.lineBetween(336, 1042, 384, 1042);
    bg.lineBetween(340, 1048, 380, 1048);

    drawCeilingLight(this, GAME_WIDTH / 2, 26, 320);
    drawAreaSign(this, 112, 220, '샤워장');

    // 샤워기 (파이프 + 헤드 + 밸브)
    const fixture = this.add.graphics();
    fixture.fillStyle(0xc8ccd8, 1);
    fixture.fillRect(144, 240, 12, 150);
    fixture.fillRoundedRect(128, 384, 44, 14, 6);
    fixture.fillStyle(0xb2b8c8, 1);
    fixture.fillEllipse(150, 408, 44, 18);
    fixture.fillStyle(0x8f96a8, 1);
    fixture.fillEllipse(150, 412, 34, 10);
    fixture.fillStyle(0xd8c060, 1);
    fixture.fillCircle(150, 330, 9);
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

    // 문 (오른쪽) — 정문
    const door = this.add.graphics();
    const doorX = GAME_WIDTH - 170;
    door.fillStyle(0x6e5236, 1);
    door.fillRoundedRect(doorX - 8, 422, 166, 432, 8);
    door.fillGradientStyle(0x8a6a48, 0x8a6a48, 0x6e5236, 0x6e5236, 1);
    door.fillRoundedRect(doorX, 430, 150, 420, 6);
    door.lineStyle(3, 0x5a4229, 0.8);
    door.strokeRoundedRect(doorX + 22, 470, 106, 140, 5);
    door.strokeRoundedRect(doorX + 22, 650, 106, 160, 5);
    door.fillStyle(0xd8c060, 1);
    door.fillCircle(doorX + 25, 650, 10);

    // 옆 칸 샤워부스 — 두 번째 등장 지점 (파티션 + 커튼)
    const stall = this.add.graphics();
    stall.fillStyle(0x7fa8b8, 1);
    stall.fillRoundedRect(CURTAIN_X - 94, 430, 18, 402, 5);
    stall.fillRoundedRect(CURTAIN_X + 76, 430, 18, 402, 5);
    stall.fillStyle(0xc8ccd8, 1);
    stall.fillRect(CURTAIN_X - 88, 444, 176, 8);
    stall.fillGradientStyle(0x4f88a8, 0x4f88a8, 0x3d6b8a, 0x3d6b8a, 0.95);
    stall.fillRoundedRect(CURTAIN_X - 70, 452, 140, 388, { tl: 0, tr: 0, bl: 10, br: 10 });
    stall.lineStyle(2, 0x2a4d66, 0.7);
    for (let x = CURTAIN_X - 58; x < CURTAIN_X + 70; x += 16) {
      stall.lineBetween(x, 456, x, 836);
    }
    stall.fillStyle(0xe6e9ee, 1);
    for (let x = CURTAIN_X - 78; x <= CURTAIN_X + 78; x += 26) {
      stall.fillCircle(x, 448, 5);
    }

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

    audio.startSong();

    this.startSeniorLoop({
      params: () => ({
        gapMs: randRange(Q1_SHOWER.gapMsRange(this.day)),
        stayMs: randRange(Q1_SHOWER.stayMsRange(this.day)),
      }),
      onEnter: () => {
        this.seniorState = 'in';
        this.reacted = false;
        this.seniorSpot = chance(0.5) ? 'door' : 'curtain';
        this.senior.setPosition(this.seniorSpot === 'door' ? DOOR_X : CURTAIN_X, 700);
        this.senior.setVisible(true);
        // 옆 칸 커튼 쪽은 더 가까운 만큼 반응할 시간이 더 짧다
        const reactMs = Q1_SHOWER.reactMs(this.day) * (this.seniorSpot === 'curtain' ? 0.7 : 1);
        this.time.delayedCall(reactMs, () => {
          if (this.finished || this.seniorState !== 'in') return;
          if (this.holding) {
            this.reacted = true;
          } else {
            this.fail('반응이 늦었다! 노랫소리를 들켰다.');
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
    if (playing) {
      this.songProgressMs += delta;
      if (this.songProgressMs >= this.songMs) {
        this.succeed('노래를 끝까지 들었다! 오늘의 낭만 완수.');
        return;
      }
    }

    // 반응에 성공해 숨은 뒤, 선배가 있는 동안 손을 떼면 발각
    if (this.seniorState === 'in' && this.reacted && !this.holding) {
      this.fail('선배 앞에서 노래가 다시 흘러나왔다...!');
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
