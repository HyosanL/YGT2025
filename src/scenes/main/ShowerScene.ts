import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q1_SHOWER } from '../../config';
import { audio } from '../../core/AudioManager';
import { AlertGauge } from '../../ui/AlertGauge';
import { Button } from '../../ui/Button';
import { Cadet } from '../../ui/Characters';
import { randRange } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

/**
 * Q1. 샤워장에서 몰래 노래 틀기.
 * 노래는 기본 재생 — [⏸] 버튼을 누르고 있는 동안만 멈춘다 (몰래춤추기의 반전 구조).
 * 선배가 문을 열고 들어올 때 재생 중이면 발각. 선배가 나갈 때까지 홀드 유지.
 */
export class ShowerScene extends BaseMainScene {
  private holding = false;
  private seniorState: 'away' | 'warn' | 'in' = 'away';
  private songProgressMs = 0;
  private showerRemainMs = 1;
  private songMs = 1;
  private showerTotalMs = 1;

  private player!: Cadet;
  private senior!: Cadet;
  private alert!: AlertGauge;
  private doorShadow!: Phaser.GameObjects.Rectangle;
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

    // 배경: 타일 느낌
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2a4d6e, 0x2a4d6e, 0x1d3a52, 0x1d3a52, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.lineStyle(2, 0xffffff, 0.08);
    for (let x = 0; x <= GAME_WIDTH; x += 90) bg.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y <= GAME_HEIGHT; y += 90) bg.lineBetween(0, y, GAME_WIDTH, y);

    // 샤워기 + 물줄기
    this.add.text(150, 380, '🚿', { fontFamily: FONT, fontSize: '80px' }).setOrigin(0.5);
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

    // 문 (오른쪽)
    const door = this.add.graphics();
    door.fillStyle(0x5a4632, 1);
    door.fillRoundedRect(GAME_WIDTH - 170, 430, 150, 420, 8);
    door.fillStyle(0xd0b878, 1);
    door.fillCircle(GAME_WIDTH - 145, 650, 10);
    this.doorShadow = this.add
      .rectangle(GAME_WIDTH - 95, 640, 150, 420, 0x000000, 0)
      .setDepth(5);

    this.senior = new Cadet(this, GAME_WIDTH - 95, 700, 'senior');
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

    this.alert = new AlertGauge(this, GAME_WIDTH - 200, 380);

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
      },
      onUp: () => {
        this.holding = false;
        this.player.setFace('🎵');
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
        warnMs: Q1_SHOWER.warnMs(this.day),
        stayMs: randRange(Q1_SHOWER.stayMsRange(this.day)),
      }),
      onWarn: (warnMs) => {
        this.seniorState = 'warn';
        this.alert.show();
        this.tweens.add({ targets: this.doorShadow, fillAlpha: 0.5, duration: warnMs });
        this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: warnMs,
          onUpdate: (tw) => this.alert.setProgress(tw.getValue() ?? 0),
        });
      },
      onEnter: () => {
        this.seniorState = 'in';
        this.alert.hide();
        audio.door();
        this.doorShadow.setFillStyle(0x000000, 0);
        this.senior.setVisible(true);
        if (!this.holding) {
          this.fail('노랫소리를 들은 선배가 문을 벌컥 열었다!');
        }
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

    // 선배가 있는 동안 손을 떼면 발각
    if (this.seniorState === 'in' && !this.holding) {
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
