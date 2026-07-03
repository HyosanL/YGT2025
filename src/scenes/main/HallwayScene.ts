import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q2_HALLWAY } from '../../config';
import { audio } from '../../core/AudioManager';
import { Button } from '../../ui/Button';
import { Cadet, speechBubble } from '../../ui/Characters';
import {
  drawCeilingLight,
  drawDoor,
  drawExtinguisher,
  drawLightShaft,
  drawWallClock,
  drawWindowView,
} from '../../ui/Scenery';
import { chance, randRange } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

type JuniorState = 'idle' | 'approaching' | 'saluting' | 'leaving';
type SeniorSide = 'left' | 'right';

const SENIOR_RIGHT_X = GAME_WIDTH - 115;
const SENIOR_LEFT_X = 115;

/**
 * Q2. 복도에서 경례 대신 인사로 받기.
 * 후배 경례를 "인사"로 N회 받으면 성공 — 단, 그 순간 선배가 보고 있으면 게임 오버.
 * 선배는 예고 없이 복도 좌/우 양쪽 문 중 무작위로 갑자기 나타난다.
 */
export class HallwayScene extends BaseMainScene {
  private juniorState: JuniorState = 'idle';
  private seniorVisible = false;
  private seniorSide: SeniorSide = 'right';
  private count = 0;
  private target = 3;
  private saluteRemainingMs = 0;
  private saluteWindowMs = 1;
  private saluteTimeout: Phaser.Time.TimerEvent | null = null;

  private junior!: Cadet;
  private senior!: Cadet;
  private countText!: Phaser.GameObjects.Text;
  private windowFill!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'hallway' });
  }

  create(): void {
    this.juniorState = 'idle';
    this.seniorVisible = false;
    this.count = 0;
    this.saluteRemainingMs = 0;
    this.saluteTimeout = null;

    // 애니풍 생활관 복도 — 크림 벽 + 세이지 하부몰딩 + 광택 바닥
    const bg = this.add.graphics();
    bg.fillGradientStyle(0xf0ead9, 0xf0ead9, 0xe2dcc8, 0xe2dcc8, 1);
    bg.fillRect(0, 0, GAME_WIDTH, 520);
    // 하부 몰딩
    bg.fillStyle(0x9aa583, 1);
    bg.fillRect(0, 428, GAME_WIDTH, 92);
    bg.fillStyle(0x7d8a6a, 1);
    bg.fillRect(0, 428, GAME_WIDTH, 8);
    // 광택 바닥 (원근)
    bg.fillGradientStyle(0xcfc9b8, 0xcfc9b8, 0x9d978a, 0x9d978a, 1);
    bg.fillTriangle(240, 520, 480, 520, GAME_WIDTH + 100, GAME_HEIGHT);
    bg.fillTriangle(240, 520, -100, GAME_HEIGHT, GAME_WIDTH + 100, GAME_HEIGHT);
    // 창문 빛 반사 줄
    bg.fillStyle(0xffffff, 0.12);
    bg.fillTriangle(300, 560, 360, 560, 240, GAME_HEIGHT);
    bg.fillTriangle(430, 560, 490, 560, 580, GAME_HEIGHT);
    // 원근 보조선 (걸레받이)
    bg.lineStyle(4, 0x8a8474, 0.5);
    bg.lineBetween(240, 520, -100, GAME_HEIGHT);
    bg.lineBetween(480, 520, GAME_WIDTH + 100, GAME_HEIGHT);

    // 창문 3개 + 바닥으로 떨어지는 빛
    for (let i = 0; i < 3; i++) {
      const wx = 70 + i * 220;
      drawWindowView(this, wx, 220, 150, 190);
      drawLightShaft(this, wx + 75, 415, 150, wx + 150, 920, 260, 0xfff2c4, 0.06);
    }
    drawCeilingLight(this, 250, 36, 220);
    drawCeilingLight(this, 520, 36, 220);
    drawWallClock(this, 360, 160, 24);
    drawExtinguisher(this, 585, 585, 1);

    // 좌/우 문 (선배가 예고 없이 나타날 수 있는 두 지점)
    drawDoor(this, 20, 330, 130, 260, 0x7a5a3c, '3소대');
    drawDoor(this, GAME_WIDTH - 150, 330, 130, 260, 0x7a5a3c, '2소대');

    this.countText = this.add
      .text(GAME_WIDTH / 2, 90, '', {
        fontFamily: FONT,
        fontSize: '40px',
        color: COLORS.textCss,
        fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: { x: 24, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.senior = new Cadet(this, SENIOR_RIGHT_X, 500, 'senior');
    this.senior.setScale(0.8).setVisible(false).setDepth(6);

    this.junior = new Cadet(this, GAME_WIDTH / 2, 560, 'junior');
    this.junior.setVisible(false).setDepth(5);

    // 응답 시간 바
    const wBg = this.add.graphics();
    wBg.fillStyle(0x000000, 0.5);
    wBg.fillRoundedRect(GAME_WIDTH / 2 - 180, GAME_HEIGHT - 330, 360, 24, 8);
    this.windowFill = this.add.graphics();

    // 조작 버튼
    new Button(this, GAME_WIDTH / 2 - 165, GAME_HEIGHT - 190, {
      label: '🙇 인사로 받기',
      width: 310,
      height: 130,
      color: COLORS.accent,
      fontSize: 34,
      onClick: () => this.onGreet(),
    });
    new Button(this, GAME_WIDTH / 2 + 165, GAME_HEIGHT - 190, {
      label: '🫡 경례로 받기',
      width: 310,
      height: 130,
      color: COLORS.panelLight,
      fontSize: 34,
      onClick: () => this.onSalute(),
    });
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 90, '인사로 받아야 카운트! 선배가 보고 있는지 확인하고...', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5);

    this.setupCommon();
    this.target = Q2_HALLWAY.targetCount(this.day);
    this.saluteWindowMs = Q2_HALLWAY.saluteWindowMs(this.day);
    this.updateCountText();

    // 후배 사이클 시작
    this.time.delayedCall(500, () => this.startApproach());

    // 선배 등장/퇴장 루프 (독립, 예고 없이 좌/우 무작위 등장)
    this.startSeniorLoop({
      params: () => ({
        gapMs: randRange(Q2_HALLWAY.seniorGapMsRange(this.day)),
        stayMs: randRange(Q2_HALLWAY.seniorStayMsRange(this.day)),
      }),
      onEnter: () => {
        this.seniorVisible = true;
        this.seniorSide = chance(0.5) ? 'left' : 'right';
        this.senior.setPosition(this.seniorSide === 'right' ? SENIOR_RIGHT_X : SENIOR_LEFT_X, 500);
        this.senior.setVisible(true);
        this.senior.setFace('👀');
      },
      onLeave: () => {
        this.seniorVisible = false;
        this.senior.setVisible(false);
      },
    });
  }

  private updateCountText(): void {
    this.countText.setText(`인사 성공 ${this.count} / ${this.target}`);
  }

  private startApproach(): void {
    if (this.finished) return;
    this.juniorState = 'approaching';
    this.junior.setVisible(true).setPosition(GAME_WIDTH / 2, 480).setScale(0.4).setAlpha(0.9);
    this.junior.setFace('😳');
    this.junior.setMotion('walk');
    this.tweens.add({
      targets: this.junior,
      y: 700,
      scale: 1,
      alpha: 1,
      duration: Q2_HALLWAY.approachMs(this.day),
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (this.finished || this.juniorState !== 'approaching') return;
        this.startSalute();
      },
    });
  }

  private startSalute(): void {
    this.juniorState = 'saluting';
    this.junior.setFace('🫡');
    this.junior.setMotion('salute');
    speechBubble(this, GAME_WIDTH / 2, 520, '충성!');
    audio.chime();
    this.saluteRemainingMs = this.saluteWindowMs;
    this.saluteTimeout = this.time.delayedCall(this.saluteWindowMs, () => {
      if (this.finished || this.juniorState !== 'saluting') return;
      this.applyDamage(Q2_HALLWAY.hpIgnoreSalute, '경례를 무시했다... 건방지다고 소문났다');
      this.junior.setFace('😒');
      this.resolveCycle();
    });
  }

  private resolveCycle(): void {
    this.saluteTimeout?.remove();
    this.saluteTimeout = null;
    this.juniorState = 'leaving';
    this.windowFill.clear();
    this.junior.setMotion('walk');
    this.tweens.add({
      targets: this.junior,
      y: 1050,
      alpha: 0,
      duration: 600,
      onComplete: () => this.junior.setVisible(false),
    });
    if (this.count >= this.target || this.finished) return;
    this.time.delayedCall(randRange(Q2_HALLWAY.juniorGapMsRange(this.day)), () =>
      this.startApproach()
    );
  }

  private onGreet(): void {
    if (this.finished) return;
    if (this.juniorState !== 'saluting') return;
    if (this.seniorVisible) {
      this.senior.setFace('😡');
      speechBubble(this, this.senior.x, 340, '너 지금 뭐 했냐?');
      this.fail('경례를 고개 까딱으로 받는 순간, 선배와 눈이 마주쳤다.');
      return;
    }
    this.count += 1;
    this.updateCountText();
    audio.chime();
    this.junior.setFace('😳');
    speechBubble(this, GAME_WIDTH / 2, 520, '충... 충성?');
    if (this.count >= this.target) {
      this.resolveCycle();
      this.succeed('오늘의 어깨힘주기 할당량을 채웠다!');
      return;
    }
    this.resolveCycle();
  }

  private onSalute(): void {
    if (this.finished) return;
    if (this.juniorState === 'saluting') {
      this.junior.setFace('🙂');
      this.resolveCycle();
      return;
    }
    if (this.juniorState === 'approaching') {
      // 후배가 경례하기 전에 먼저 경례해버림 — 선경례 굴욕
      speechBubble(this, GAME_WIDTH / 2, this.junior.y - 160, '풉... ㅋㅋ');
      this.applyDamage(Q2_HALLWAY.hpPreemptiveSalute, '후배한테 선경례해버렸다...!');
    }
  }

  protected tick(delta: number): void {
    if (this.juniorState === 'saluting') {
      const remain = Math.max(0, this.saluteRemainingMs - delta);
      this.saluteRemainingMs = remain;
      const ratio = remain / this.saluteWindowMs;
      this.windowFill.clear();
      this.windowFill.fillStyle(ratio < 0.35 ? COLORS.accent : COLORS.safe, 1);
      this.windowFill.fillRoundedRect(
        GAME_WIDTH / 2 - 174,
        GAME_HEIGHT - 326,
        348 * ratio,
        16,
        5
      );
    }
  }
}
