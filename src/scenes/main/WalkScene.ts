import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q4_WALK } from '../../config';
import { gameState } from '../../core/GameState';
import { Cadet } from '../../ui/Characters';
import {
  drawBarracks,
  drawCloud,
  drawFlagpole,
  drawMountains,
  drawSkyGradient,
  drawStreetlight,
  drawTree,
} from '../../ui/Scenery';
import { pick, randRange } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

const ROAD_TOP = 500;

/**
 * Q4. 태권도장까지 걸어가기 — 화면 홀드 = 뛰기(HP 소모), 떼면 걷기.
 * 선배는 예고 없이 좌/우/정면 중 무작위 방향에서 갑자기 나타난다.
 * 등장 순간 반응 유예(graceMs) 안에 뛰기로 전환하지 못하면 게임 오버.
 */
export class WalkScene extends BaseMainScene {
  private progressMs = 0;
  private targetMs = 1;
  private holding = false;
  private seniorState: 'away' | 'in' = 'away';
  private notRunningMs = 0;
  private graceMs = 300;
  private seniorSide: 'left' | 'right' | 'center' = 'right';

  private player!: Cadet;
  private senior!: Cadet;
  private progressFill!: Phaser.GameObjects.Graphics;
  private stateText!: Phaser.GameObjects.Text;
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

    // 애니풍 노을 하늘 + 원경 산 + 생활관 건물
    drawSkyGradient(this, 0, 0, GAME_WIDTH, ROAD_TOP, 0x5d82b8, 0xf2c18e);
    const sun = this.add.graphics();
    sun.fillStyle(0xffe9b8, 0.25);
    sun.fillCircle(560, 400, 70);
    sun.fillStyle(0xfff3d0, 1);
    sun.fillCircle(560, 400, 34);
    drawCloud(this, 150, 130, 1.1, 0.85);
    drawCloud(this, 520, 215, 0.8, 0.7);
    drawMountains(this, ROAD_TOP - 28, 150, 0x54679a, 0.9);
    drawMountains(this, ROAD_TOP - 28, 90, 0x40527e, 1);
    drawBarracks(this, 30, ROAD_TOP - 26, 220, 120, 0x37415e);
    drawBarracks(this, 480, ROAD_TOP - 26, 210, 100, 0x3d4868);
    drawFlagpole(this, 320, ROAD_TOP - 26, 150);
    // 저 멀리 태권도장
    const dojang = this.add.graphics();
    dojang.fillStyle(0x8a4a3c, 1);
    dojang.fillRect(330, 442, 60, 32);
    dojang.fillStyle(0x5c2f28, 1);
    dojang.fillTriangle(320, 442, 400, 442, 360, 416);

    // 잔디 둔덕 + 도로 (원근)
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x3f7d4e, 0x3f7d4e, 0x2e5e3e, 0x2e5e3e, 1);
    bg.fillRect(0, ROAD_TOP - 30, GAME_WIDTH, 30);
    bg.fillStyle(0x44475a, 1);
    bg.fillTriangle(280, ROAD_TOP, 440, ROAD_TOP, GAME_WIDTH + 200, GAME_HEIGHT);
    bg.fillTriangle(280, ROAD_TOP, -200, GAME_HEIGHT, GAME_WIDTH + 200, GAME_HEIGHT);
    // 도로 양옆 잔디
    bg.fillStyle(0x2e5e3e, 1);
    bg.fillTriangle(280, ROAD_TOP, -200, GAME_HEIGHT, -560, GAME_HEIGHT);
    bg.fillTriangle(440, ROAD_TOP, GAME_WIDTH + 200, GAME_HEIGHT, GAME_WIDTH + 560, GAME_HEIGHT);
    // 도로 가장자리 차선
    bg.lineStyle(6, 0xe8e4d8, 0.7);
    bg.lineBetween(280, ROAD_TOP, -200, GAME_HEIGHT);
    bg.lineBetween(440, ROAD_TOP, GAME_WIDTH + 200, GAME_HEIGHT);
    // 노을빛이 도로에 스며드는 하이라이트
    bg.fillGradientStyle(0xf2c18e, 0xf2c18e, 0xf2c18e, 0xf2c18e, 0.12, 0.12, 0, 0);
    bg.fillRect(0, ROAD_TOP, GAME_WIDTH, 220);
    // 가로수 + 가로등
    drawTree(this, 70, 690, 1.15, 0x3f7d4e);
    drawTree(this, 645, 660, 0.95, 0x4e8d55);
    drawStreetlight(this, 140, 620, 130, 1);
    drawStreetlight(this, 580, 610, 120, -1);

    this.add
      .text(GAME_WIDTH / 2, ROAD_TOP - 90, '🥋 태권도장은 저 멀리...', {
        fontFamily: FONT,
        fontSize: '28px',
        color: '#f5ecd8',
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

    this.player = new Cadet(this, GAME_WIDTH / 2, 1010, 'player');
    this.player.setMotion('walk');

    this.senior = new Cadet(this, GAME_WIDTH + 150, 820, 'senior');
    this.senior.setVisible(false);

    // 구보 중 발밑 흙먼지
    this.time.addEvent({
      delay: 120,
      loop: true,
      callback: () => {
        if (!this.holding || this.finished) return;
        const puff = this.add.circle(
          this.player.x + Phaser.Math.Between(-26, 26),
          this.player.y + 96,
          Phaser.Math.Between(5, 10),
          0xd9cfc0,
          0.35
        );
        this.tweens.add({
          targets: puff,
          y: puff.y + 20,
          scale: 1.9,
          alpha: 0,
          duration: 380,
          onComplete: () => puff.destroy(),
        });
      },
    });

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
        stayMs: randRange(Q4_WALK.stayMsRange(this.day)),
      }),
      onEnter: () => {
        this.seniorState = 'in';
        this.notRunningMs = 0;
        this.graceMs = Q4_WALK.graceMs(this.day);
        this.seniorSide = pick(['left', 'right', 'center'] as const);
        if (this.seniorSide === 'center') {
          // 정면에 갑자기 나타남 — 텔레그래프 없이 즉시 등장
          this.senior.setPosition(GAME_WIDTH / 2, 780).setScale(0.7).setAlpha(0);
          this.senior.setVisible(true);
          this.senior.setMotion('idle');
          this.tweens.add({ targets: this.senior, alpha: 1, scale: 1, duration: 120 });
        } else {
          const targetX = this.seniorSide === 'right' ? GAME_WIDTH - 130 : 130;
          this.senior
            .setPosition(this.seniorSide === 'right' ? GAME_WIDTH + 150 : -150, 820)
            .setScale(1)
            .setAlpha(1);
          this.senior.setVisible(true);
          this.senior.setMotion('run');
          this.tweens.add({
            targets: this.senior,
            x: targetX,
            duration: 160,
            ease: 'Cubic.easeOut',
            onComplete: () => this.senior.setMotion('idle'),
          });
        }
      },
      onLeave: () => {
        this.seniorState = 'away';
        if (this.seniorSide === 'center') {
          this.senior.setVisible(false);
          return;
        }
        this.senior.setMotion('run');
        this.tweens.add({
          targets: this.senior,
          x: this.seniorSide === 'right' ? GAME_WIDTH + 150 : -150,
          duration: 300,
          onComplete: () => {
            this.senior.setVisible(false);
            this.senior.setMotion('idle');
          },
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
        if (this.notRunningMs > this.graceMs) {
          this.player.setFace('😨');
          this.fail('선배가 갑자기 나타났는데 반응이 늦었다! 걷는 걸 들켰다.');
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
    this.player.setMotion(this.holding ? 'run' : 'walk');

    const speed = (this.holding ? 0.55 : 0.25) * delta;
    for (const s of this.stripes) {
      s.y += speed * (0.5 + (s.y - ROAD_TOP) / 400);
      if (s.y > GAME_HEIGHT + 40) s.y = ROAD_TOP + 30;
      const t = (s.y - ROAD_TOP) / (GAME_HEIGHT - ROAD_TOP);
      s.setScale(0.4 + t, 0.4 + t);
    }
  }
}
