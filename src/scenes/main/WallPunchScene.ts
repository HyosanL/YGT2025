import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q5_WALLPUNCH } from '../../config';
import { audio } from '../../core/AudioManager';
import { Button } from '../../ui/Button';
import { Cadet, speechBubble } from '../../ui/Characters';
import { chance, randFloat } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

const WALL_X = 130;

/**
 * Q5. 옆방(1학년 방) 벽 치기 — 순도 100% 도박 (10일차부터).
 * 벽을 칠 때마다 판정 롤. 선배가 있으면 즉사. 그만두기 불가.
 */
export class WallPunchScene extends BaseMainScene {
  private count = 0;
  private target = 5;
  private rolling = false;

  private punchBtn!: Button;
  private countText!: Phaser.GameObjects.Text;
  private wall!: Phaser.GameObjects.Container;
  private dim!: Phaser.GameObjects.Rectangle;
  private suspenseText!: Phaser.GameObjects.Text;
  private player!: Cadet;

  constructor() {
    super({ key: 'wallpunch' });
  }

  create(): void {
    this.count = 0;
    this.rolling = false;

    // 소등 후 어두운 방
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0d0d1a, 0x0d0d1a, 0x14142a, 0x14142a, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    // 달빛 창문
    bg.fillStyle(0x2c3e6b, 0.8);
    bg.fillRoundedRect(GAME_WIDTH - 220, 180, 160, 220, 10);
    this.add
      .text(GAME_WIDTH - 140, 290, '🌙', { fontFamily: FONT, fontSize: '54px' })
      .setOrigin(0.5);

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

    // 침대 + 플레이어
    const bed = this.add.graphics();
    bed.fillStyle(0x2a4a3e, 1);
    bed.fillRoundedRect(300, 760, 360, 150, 16);
    bed.fillStyle(0xd9d9d9, 1);
    bed.fillRoundedRect(310, 730, 100, 60, 12);
    this.player = new Cadet(this, 480, 700, 'player');
    this.player.setFace('😈');

    this.countText = this.add
      .text(GAME_WIDTH / 2 + 60, 120, '', {
        fontFamily: FONT,
        fontSize: '44px',
        color: COLORS.textCss,
        fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: { x: 24, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.add
      .text(GAME_WIDTH / 2 + 60, 190, '일단 시작하면 되돌릴 수 없다', {
        fontFamily: FONT,
        fontSize: '26px',
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

    this.punchBtn = new Button(this, GAME_WIDTH / 2 + 60, GAME_HEIGHT - 200, {
      label: '👊 벽 치기',
      width: 420,
      height: 140,
      color: COLORS.accent,
      fontSize: 42,
      onClick: () => this.punch(),
    });

    this.setupCommon();
    this.target = Q5_WALLPUNCH.hits(this.day);
    this.updateCount();
  }

  private updateCount(): void {
    this.countText.setText(`벽치기 ${this.count} / ${this.target}`);
  }

  private punch(): void {
    if (this.finished || this.rolling) return;
    this.rolling = true;
    this.punchBtn.setEnabled(false);

    audio.thud();
    this.player.punchOnce('left');
    this.cameras.main.shake(150, 0.008);
    this.tweens.add({ targets: this.wall, x: WALL_X - 14, duration: 60, yoyo: true });
    // 벽에 금 가는 연출
    const crack = this.add
      .text(WALL_X + randFloat(-70, 70), randFloat(380, 800), '💢', {
        fontFamily: FONT,
        fontSize: '40px',
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.time.delayedCall(2500, () => crack.destroy());

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
        // 벽 너머에 선배가 있었다
        this.time.delayedCall(400, () => {
          audio.door();
          const senior = new Cadet(this, WALL_X + 200, 620, 'senior');
          senior.setDepth(70);
          speechBubble(this, WALL_X + 200, 400, '...여기 2학년 방이지?', 1800);
          this.player.setFace('😱');
          this.fail('벽 너머엔 선배가 놀러와 있었다... 문이 벌컥 열렸다.');
        });
        return;
      }

      // 1학년의 리액션
      this.count += 1;
      this.updateCount();
      audio.chime();
      speechBubble(this, WALL_X + 120, 500, '충... 충성!!');
      this.player.setFace('😈');

      if (this.count >= this.target) {
        this.succeed('오늘 밤도 1학년들만 고생했다... 완벽한 장난이었다.');
        return;
      }
      this.rolling = false;
      this.punchBtn.setEnabled(true);
    });
  }

  protected tick(_delta: number): void {
    // 판정은 전부 이벤트 기반 — 프레임 로직 없음
  }
}
