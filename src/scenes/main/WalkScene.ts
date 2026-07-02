import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q4_WALK } from '../../config';
import { gameState } from '../../core/GameState';
import { AlertGauge } from '../../ui/AlertGauge';
import { Cadet } from '../../ui/Characters';
import { randRange } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

const ROAD_TOP = 500;

/**
 * Q4. 태권도장까지 걸어가기 — 화면 홀드 = 뛰기(HP 소모), 떼면 걷기.
 * 선배가 보일 때 걷고 있으면 게임 오버.
 */
export class WalkScene extends BaseMainScene {
  private progressMs = 0;
  private targetMs = 1;
  private holding = false;
  private seniorState: 'away' | 'warn' | 'in' = 'away';
  private notRunningMs = 0;
  private seniorSide: 1 | -1 = 1;

  private player!: Cadet;
  private senior!: Cadet;
  private alert!: AlertGauge;
  private progressFill!: Phaser.GameObjects.Graphics;
  private stateText!: Phaser.GameObjects.Text;
  private warnIcon!: Phaser.GameObjects.Text;
  private stripes: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super({ key: 'walk' });
  }

  create(): void {
    this.progressMs = 0;
    this.holding = false;
    this.seniorState = 'away';
    this.notRunningMs = 0;
    this.targetMs = Q4_WALK.distanceMs(gameState.day);

    // 하늘 + 도로
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x3a5a8c, 0x3a5a8c, 0x6d8bb5, 0x6d8bb5, 1);
    bg.fillRect(0, 0, GAME_WIDTH, ROAD_TOP);
    bg.fillStyle(0x3d3d4d, 1);
    bg.fillTriangle(280, ROAD_TOP, 440, ROAD_TOP, GAME_WIDTH + 200, GAME_HEIGHT);
    bg.fillTriangle(280, ROAD_TOP, -200, GAME_HEIGHT, GAME_WIDTH + 200, GAME_HEIGHT);
    bg.fillStyle(0x2e5e3e, 1);
    bg.fillRect(0, ROAD_TOP - 30, GAME_WIDTH, 30);
    this.add
      .text(GAME_WIDTH / 2, ROAD_TOP - 90, '🥋 태권도장은 저 멀리...', {
        fontFamily: FONT,
        fontSize: '28px',
        color: '#dce6f5',
      })
      .setOrigin(0.5);

    // 중앙선 (이동 연출)
    this.stripes = [];
    for (let i = 0; i < 6; i++) {
      const y = ROAD_TOP + 40 + i * 130;
      const s = this.add.rectangle(GAME_WIDTH / 2, y, 14, 60, 0xf5f5f5, 0.8);
      this.stripes.push(s);
    }

    // 도착 게이지
    const barBg = this.add.graphics();
    barBg.fillStyle(0x000000, 0.55);
    barBg.fillRoundedRect(GAME_WIDTH / 2 - 220, 80, 440, 40, 10);
    this.progressFill = this.add.graphics();
    this.add
      .text(GAME_WIDTH / 2, 100, '도착까지', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.textCss,
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.alert = new AlertGauge(this, GAME_WIDTH / 2, 170);

    this.warnIcon = this.add
      .text(GAME_WIDTH - 60, 700, '❗', { fontFamily: FONT, fontSize: '72px' })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(500);

    this.player = new Cadet(this, GAME_WIDTH / 2, 1010, 'player');
    this.tweens.add({
      targets: this.player,
      y: 1000,
      duration: 400,
      yoyo: true,
      repeat: -1,
    });

    this.senior = new Cadet(this, GAME_WIDTH + 150, 820, 'senior');
    this.senior.setVisible(false);

    this.stateText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 120, '🚶 걷는 중... (화면을 꾹 누르면 뛰기)', {
        fontFamily: FONT,
        fontSize: '30px',
        color: COLORS.textCss,
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5);

    this.input.on('pointerdown', () => {
      this.holding = true;
    });
    this.input.on('pointerup', () => {
      this.holding = false;
    });

    this.setupCommon();

    this.startSeniorLoop({
      params: () => ({
        gapMs: randRange(Q4_WALK.gapMsRange(this.day)),
        warnMs: Q4_WALK.warnMs(this.day),
        stayMs: randRange(Q4_WALK.stayMsRange(this.day)),
      }),
      onWarn: (warnMs) => {
        this.seniorState = 'warn';
        this.seniorSide = Math.random() < 0.5 ? 1 : -1;
        this.warnIcon.setX(this.seniorSide === 1 ? GAME_WIDTH - 60 : 60).setVisible(true);
        this.alert.show();
        this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: warnMs,
          onUpdate: (tw) => this.alert.setProgress(tw.getValue() ?? 0),
        });
      },
      onEnter: () => {
        this.seniorState = 'in';
        this.notRunningMs = 0;
        this.warnIcon.setVisible(false);
        this.alert.hide();
        const targetX = this.seniorSide === 1 ? GAME_WIDTH - 130 : 130;
        this.senior.setPosition(this.seniorSide === 1 ? GAME_WIDTH + 150 : -150, 820);
        this.senior.setVisible(true);
        this.tweens.add({ targets: this.senior, x: targetX, duration: 300, ease: 'Cubic.easeOut' });
      },
      onLeave: () => {
        this.seniorState = 'away';
        this.tweens.add({
          targets: this.senior,
          x: this.seniorSide === 1 ? GAME_WIDTH + 150 : -150,
          duration: 300,
          onComplete: () => this.senior.setVisible(false),
        });
      },
    });
  }

  protected tick(delta: number): void {
    // 도착 게이지 (걷든 뛰든 동일 속도 — 뛰기의 대가는 HP)
    this.progressMs += delta;
    const ratio = Math.min(1, this.progressMs / this.targetMs);
    this.progressFill.clear();
    this.progressFill.fillStyle(COLORS.safe, 1);
    this.progressFill.fillRoundedRect(GAME_WIDTH / 2 - 214, 86, 428 * ratio, 28, 7);
    if (ratio >= 1) {
      this.succeed('무사히 태권도장에 도착했다!');
      return;
    }

    // 뛰기 HP 드레인
    if (this.holding) {
      if (gameState.damage((Q4_WALK.runHpPerSec * delta) / 1000)) {
        this.fail('무리하게 뛰다가 탈진해서 쓰러졌다...');
        return;
      }
    }

    // 선배 판정
    if (this.seniorState === 'in') {
      if (this.holding) {
        this.notRunningMs = 0;
      } else {
        this.notRunningMs += delta;
        if (this.notRunningMs > Q4_WALK.graceMs) {
          this.player.setFace('😨');
          this.fail('이동 간 구보 위반! 걷는 걸 선배에게 들켰다.');
          return;
        }
      }
    }

    // 연출 갱신
    this.stateText.setText(
      this.holding ? '🏃 구보 중!! (HP 소모 중)' : '🚶 걷는 중... (화면을 꾹 누르면 뛰기)'
    );
    this.stateText.setColor(this.holding ? COLORS.warnCss : COLORS.textCss);
    this.player.setFace(this.holding ? '😤' : '😏');

    const speed = (this.holding ? 0.55 : 0.25) * delta;
    for (const s of this.stripes) {
      s.y += speed * (0.5 + (s.y - ROAD_TOP) / 400);
      if (s.y > GAME_HEIGHT + 40) s.y = ROAD_TOP + 30;
      const t = (s.y - ROAD_TOP) / (GAME_HEIGHT - ROAD_TOP);
      s.setScale(0.4 + t, 0.4 + t);
    }
  }
}
