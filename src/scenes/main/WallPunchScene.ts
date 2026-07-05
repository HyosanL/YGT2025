import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q5_WALLPUNCH } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import { Button } from '../../ui/Button';
import { Cadet, speechBubble } from '../../ui/Characters';
import {
  addVignette,
  drawDoor,
  drawLightShaft,
  drawLockerCabinet,
  drawWindowView,
} from '../../ui/Scenery';
import { HAPTIC, vibrate } from '../../utils/haptics';
import { chance, pick, randFloat } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

const WALL_X = 130;

/** 벽 너머 1학년들의 수다 (칠 때마다 잠깐 조용해진다) */
const CHATTER_LINES = [
  'ㅋㅋㅋㅋㅋ',
  '아 진짜라니까?',
  '미쳤나봐 ㅋㅋ',
  '야 조용히 해봐 ㅋㅋ',
  '한 판만 더 하자',
  '아 배고파...',
  'ㄹㅇㅋㅋ',
];

type PunchState = 'noisy' | 'suspense' | 'done';

/**
 * Q5. 옆방(1학년 방) 벽 치기 — 선택할 수 있는 도박.
 * 침대에 누워 있는데 옆방이 시끄럽다.
 * - 벽을 친다: 무사하면 조용해지고 ❤️ 목숨 +1. 벽 너머에 사실 선배가
 *   놀러와 있었으면 문이 벌컥 열리며 "뭐하냐?" — 즉사.
 * - 참고 잔다: 시끄러운 채로 하루가 지나간다 (안전, 보상 없음).
 */
export class WallPunchScene extends BaseMainScene {
  private punchState: PunchState = 'noisy';
  private chatterEvent: Phaser.Time.TimerEvent | null = null;

  private punchBtn!: Button;
  private sleepBtn!: Button;
  private wall!: Phaser.GameObjects.Container;
  private dim!: Phaser.GameObjects.Rectangle;
  private suspenseText!: Phaser.GameObjects.Text;
  private player!: Cadet;

  constructor() {
    super({ key: 'wallpunch' });
  }

  /** 벽 치고 난 뒤의 '정적'이 연출의 핵심 — BGM은 끈다 */
  protected bgmTrack(): null {
    return null;
  }

  create(): void {
    this.punchState = 'noisy';
    this.chatterEvent = null;

    // 소등 후 어두운 생활관 호실
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x11142a, 0x11142a, 0x1c2036, 0x1c2036, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    // 바닥
    bg.fillGradientStyle(0x232741, 0x232741, 0x1a1d31, 0x1a1d31, 1);
    bg.fillRect(0, 940, GAME_WIDTH, GAME_HEIGHT - 940);
    bg.lineStyle(2, 0xffffff, 0.04);
    for (let x = 280; x < GAME_WIDTH; x += 110) bg.lineBetween(x, 940, x, GAME_HEIGHT);
    // 벽 포스터
    bg.fillStyle(0x2c3450, 1);
    bg.fillRect(300, 290, 92, 124);
    bg.fillStyle(0x38415e, 1);
    bg.fillRect(308, 298, 76, 108);
    this.add
      .text(346, 352, '정\n신\n력', {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#8a94b8',
        align: 'center',
        lineSpacing: 2,
      })
      .setOrigin(0.5);

    // 달빛 창문 + 바닥으로 떨어지는 빛
    drawWindowView(this, GAME_WIDTH - 230, 170, 170, 230, { night: true });
    drawLightShaft(this, GAME_WIDTH - 145, 412, 170, GAME_WIDTH - 210, 940, 330, 0xbdd7ee, 0.07);

    // 옷장 + 출입문 (선배가 벌컥 열고 들어올 그 문)
    drawLockerCabinet(this, 350, 700, 0.9);
    drawDoor(this, GAME_WIDTH - 160, 430, 130, 240, 0x6e5236, '복도');
    addVignette(this, 0.35);

    // 옆방과 맞닿은 벽 (왼쪽)
    this.wall = this.add.container(WALL_X, GAME_HEIGHT / 2);
    const wallG = this.add.graphics();
    wallG.fillStyle(0x3d3d52, 1);
    wallG.fillRect(-130, -GAME_HEIGHT / 2, 260, GAME_HEIGHT);
    wallG.lineStyle(2, 0x55556e, 1);
    for (let y = -GAME_HEIGHT / 2; y < GAME_HEIGHT / 2; y += 110) {
      wallG.lineBetween(-130, y, 130, y);
    }
    this.wall.add(wallG);
    const wallLabel = this.add
      .text(0, -GAME_HEIGHT / 2 + 500, '옆방\n(1학년 방...?)', {
        fontFamily: FONT,
        fontSize: '28px',
        color: '#8888a5',
        align: 'center',
      })
      .setOrigin(0.5);
    this.wall.add(wallLabel);

    // 침대 — 벽에 붙어 있고, 기태는 누운 채 벽을 친다
    const bed = this.add.graphics();
    bed.fillStyle(0x4a3a28, 1);
    bed.fillRoundedRect(250, 762, 316, 112, 12); // 프레임
    bed.fillStyle(0x2c3348, 1);
    bed.fillRoundedRect(258, 752, 300, 34, 8); // 매트리스
    bed.fillStyle(0xe4e6ec, 1);
    bed.fillRoundedRect(260, 748, 58, 40, 10); // 베개 (벽쪽)
    bed.fillStyle(0x1c2036, 1);
    bed.fillRect(256, 874, 20, 40); // 다리
    bed.fillRect(540, 874, 20, 40);

    this.player = new Cadet(this, 398, 800, 'player');
    this.player.setScale(0.95);
    this.player.setAngle(-90); // 머리가 벽 쪽으로 — 누운 자세
    this.player.setFace('😈');

    // 이불 — 하반신 덮기 (플레이어 위 레이어)
    const blanket = this.add.graphics().setDepth(5);
    blanket.fillStyle(0x3f5d3f, 1);
    blanket.fillRoundedRect(432, 752, 132, 92, 14);
    blanket.fillStyle(0x4e714e, 1);
    blanket.fillRect(432, 768, 132, 10);

    this.add
      .text(GAME_WIDTH / 2 + 60, 120, '옆방이 너무 시끄럽다...', {
        fontFamily: FONT,
        fontSize: '40px',
        color: COLORS.textCss,
        fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: { x: 24, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.add
      .text(GAME_WIDTH / 2 + 60, 190, '치면 도박(❤️+1 or 끝장) · 참으면 그냥 하루가 간다', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.accentCss,
      })
      .setOrigin(0.5);

    this.dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0)
      .setDepth(50);

    this.suspenseText = this.add
      .text(WALL_X + 180, 460, '', {
        fontFamily: FONT,
        fontSize: '52px',
        color: COLORS.textCss,
      })
      .setOrigin(0.5)
      .setDepth(60);

    this.punchBtn = new Button(this, GAME_WIDTH / 2 + 60, GAME_HEIGHT - 280, {
      label: '👊 벽 치기 (도박)',
      width: 420,
      height: 124,
      color: COLORS.accent,
      fontSize: 36,
      onClick: () => this.punch(),
    });
    this.sleepBtn = new Button(this, GAME_WIDTH / 2 + 60, GAME_HEIGHT - 140, {
      label: '😪 참고 잔다 (안전)',
      width: 420,
      height: 104,
      color: COLORS.panelLight,
      fontSize: 32,
      onClick: () => this.sleep(),
    });

    this.setupCommon();
    this.startNoisy();
  }

  // ── 옆방 수다 (칠 때마다 조용해졌다가 다시 시작) ──

  private startNoisy(): void {
    if (this.finished) return;
    this.punchState = 'noisy';
    this.punchBtn.setEnabled(true);
    this.sleepBtn.setEnabled(true);
    this.player.setFace('😠');
    audio.startChatter();
    this.spawnChatterBubble();
    this.chatterEvent = this.time.addEvent({
      delay: 1100,
      loop: true,
      callback: () => {
        if (!this.finished && this.punchState === 'noisy') {
          audio.startChatter(); // 오디오 언락이 늦어도 self-heal
          this.spawnChatterBubble();
        }
      },
    });
  }

  private stopNoisy(): void {
    this.chatterEvent?.remove();
    this.chatterEvent = null;
    audio.stopChatter();
  }

  private spawnChatterBubble(): void {
    speechBubble(
      this,
      WALL_X + randFloat(-40, 70),
      randFloat(360, 700),
      pick(CHATTER_LINES),
      1000,
      40
    );
  }

  // ── 선택: 참고 잔다 (안전) ────────────────────

  private sleep(): void {
    if (this.finished || this.punchState !== 'noisy') return;
    this.punchState = 'done';
    this.punchBtn.setEnabled(false);
    this.sleepBtn.setEnabled(false);
    this.player.setFace('😑');
    speechBubble(this, 400, 640, '(시끄럽지만... 참자...)', 1100, 40);
    this.time.delayedCall(1200, () => this.succeed('시끄러운 밤을 견뎌냈다. 내일은 조용하길...'));
  }

  // ── 선택: 벽 치기 (도박) ──────────────────────

  private punch(): void {
    if (this.finished || this.punchState !== 'noisy') return;
    this.punchState = 'suspense';
    this.punchBtn.setEnabled(false);
    this.sleepBtn.setEnabled(false);
    this.stopNoisy(); // 순간 정적

    // 쾅! 쾅! 쾅! — 3연타
    audio.wallBang();
    this.player.punchOnce('left');
    this.cameras.main.shake(520, 0.007);
    this.tweens.add({
      targets: this.wall,
      x: WALL_X - 14,
      duration: 85,
      yoyo: true,
      repeat: 2,
    });
    // 벽에 금 가는 연출 — 타격마다 하나씩
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 170, () => {
        const crack = this.add
          .text(WALL_X + randFloat(-70, 70), randFloat(380, 760), '💢', {
            fontFamily: FONT,
            fontSize: '40px',
          })
          .setOrigin(0.5)
          .setDepth(20);
        this.time.delayedCall(2500, () => crack.destroy());
      });
    }

    // 정적... 심장박동
    this.dim.setFillStyle(0x000000, 0.45);
    this.suspenseText.setText('. . .');
    this.player.setFace('😰');
    audio.startHeartbeat();

    const suspense = randFloat(
      Q5_WALLPUNCH.suspenseMsRange[0],
      Q5_WALLPUNCH.suspenseMsRange[1]
    );
    this.time.delayedCall(suspense, () => {
      if (this.finished) return;
      audio.stopHeartbeat();
      this.dim.setFillStyle(0x000000, 0);
      this.suspenseText.setText('');

      if (chance(Q5_WALLPUNCH.seniorChance(this.day))) {
        // 벽 너머엔 선배가 놀러와 있었다 — 출입문이 벌컥 열린다
        this.time.delayedCall(400, () => {
          audio.door();
          const senior = new Cadet(this, GAME_WIDTH - 160, 620, 'senior');
          senior.setScale(0.85);
          this.player.setFace('😱');
          this.failCaught(
            senior,
            '벽 너머엔 선배가 놀러와 있었다... 문이 벌컥 열렸다.',
            '뭐하냐?'
          );
        });
        return;
      }

      // 무사 — 옆방이 조용해졌다. 도박 성공, 목숨 +1
      this.punchState = 'done';
      this.player.setFace('😌');
      speechBubble(this, 400, 640, '조용해졌다... 취침해야겠다...', 1500, 40);

      // 연습 모드에서는 목숨 보상이 없다
      const gained = gameState.practiceMode ? false : gameState.addLifeSixths(6);
      if (gained) {
        audio.chime();
        vibrate(HAPTIC.lifeGain);
        const lifeText = this.add
          .text(GAME_WIDTH / 2 + 60, 560, '❤️ 목숨 +1', {
            fontFamily: FONT,
            fontSize: '52px',
            color: COLORS.safeCss,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6,
          })
          .setOrigin(0.5)
          .setDepth(60)
          .setScale(0.4);
        this.tweens.add({
          targets: lifeText,
          scale: 1,
          y: 500,
          duration: 500,
          ease: 'Back.easeOut',
        });
      }
      this.time.delayedCall(1700, () =>
        this.succeed(
          gained
            ? '도박 성공! ❤️ 목숨을 하나 얻고 꿀잠에 들었다.'
            : gameState.practiceMode
              ? '도박 성공! (연습이라 보상은 없다)'
              : '조용해졌다. (목숨은 이미 가득)'
        )
      );
    });
  }

  protected tick(_delta: number): void {
    // 판정은 전부 이벤트 기반 — 프레임 로직 없음
  }
}
