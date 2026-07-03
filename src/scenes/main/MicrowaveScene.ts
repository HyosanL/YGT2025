import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q3_MICROWAVE } from '../../config';
import { audio } from '../../core/AudioManager';
import { Cadet } from '../../ui/Characters';
import { pick, randRange } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

type Zone = 'laundry' | 'micro';

const LAUNDRY_X = 170;
const MICRO_X = 550;
const PLAYER_Y = 820;
/** 복도를 따라 선배가 갑자기 나타날 수 있는 여러 지점 */
const SENIOR_SPOTS = [150, 360, 570] as const;

/**
 * Q3. 몰래 결식하고 전자레인지 돌리기.
 * 좌(세탁실=은신처)/우(전자레인지) 터치로 이동. 전자레인지 앞에서만 게이지가 찬다.
 * 선배는 예고 없이 복도의 여러 지점 중 한 곳에 갑자기 나타난다.
 * 등장 순간의 반응 유예(reactMs) 안에 세탁실로 피하지 못하면 발각.
 * 100% 도달 시 "삐-" 소리가 나는 동안은 숨어 있어도 선배가 있으면 발각.
 */
export class MicrowaveScene extends BaseMainScene {
  private zone: Zone = 'micro';
  private seniorState: 'away' | 'in' = 'away';
  private reacted = false;
  private cookProgressMs = 0;
  private cookTotalMs = 1;
  private beeping = false;
  private beepElapsedMs = 0;

  private player!: Cadet;
  private senior!: Cadet;
  private cookFill!: Phaser.GameObjects.Graphics;
  private cookLabel!: Phaser.GameObjects.Text;
  private beepText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'microwave' });
  }

  create(): void {
    this.zone = 'micro';
    this.seniorState = 'away';
    this.cookProgressMs = 0;
    this.beeping = false;
    this.beepElapsedMs = 0;

    // 배경
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2b2b3d, 0x2b2b3d, 0x1e1e2c, 0x1e1e2c, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    // 복도 (상단)
    bg.fillStyle(0x15151f, 1);
    bg.fillRect(0, 260, GAME_WIDTH, 160);
    this.add
      .text(GAME_WIDTH / 2, 300, '─ 복도 ─', { fontFamily: FONT, fontSize: '26px', color: '#666a80' })
      .setOrigin(0.5);
    // 바닥
    bg.fillStyle(0x3a3a4c, 1);
    bg.fillRect(0, 950, GAME_WIDTH, GAME_HEIGHT - 950);

    // 세탁실 (왼쪽)
    const laundry = this.add.graphics();
    laundry.fillStyle(0x24374a, 1);
    laundry.fillRoundedRect(40, 500, 270, 430, 14);
    laundry.lineStyle(3, 0x4a6a8a, 1);
    laundry.strokeRoundedRect(40, 500, 270, 430, 14);
    this.add.text(175, 545, '🧺 세탁실 (은신처)', {
      fontFamily: FONT,
      fontSize: '26px',
      color: COLORS.safeCss,
    }).setOrigin(0.5);
    this.add.text(120, 650, '🌀', { fontFamily: FONT, fontSize: '64px' }).setOrigin(0.5);

    // 전자레인지 (오른쪽)
    const counter = this.add.graphics();
    counter.fillStyle(0x4d3b2a, 1);
    counter.fillRect(420, 700, 270, 40);
    counter.fillStyle(0x333340, 1);
    counter.fillRoundedRect(450, 580, 210, 120, 10);
    counter.fillStyle(0x111118, 1);
    counter.fillRoundedRect(465, 595, 130, 90, 6);
    counter.fillStyle(0xffb400, 0.25);
    counter.fillRoundedRect(465, 595, 130, 90, 6);
    this.add.text(530, 640, '🍜', { fontFamily: FONT, fontSize: '48px' }).setOrigin(0.5);
    this.add.text(555, 545, '전자레인지', {
      fontFamily: FONT,
      fontSize: '24px',
      color: COLORS.subCss,
    }).setOrigin(0.5);

    // 조리 게이지
    const barBg = this.add.graphics();
    barBg.fillStyle(0x000000, 0.55);
    barBg.fillRoundedRect(GAME_WIDTH / 2 - 250, 80, 500, 44, 10);
    this.cookFill = this.add.graphics();
    this.cookLabel = this.add
      .text(GAME_WIDTH / 2, 102, '조리 0%', {
        fontFamily: FONT,
        fontSize: '26px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.beepText = this.add
      .text(530, 480, '삐 ─ !!', {
        fontFamily: FONT,
        fontSize: '44px',
        color: COLORS.accentCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.senior = new Cadet(this, GAME_WIDTH / 2, 340, 'senior');
    this.senior.setScale(0.7).setVisible(false).setDepth(5);

    this.player = new Cadet(this, MICRO_X, PLAYER_Y, 'player');
    this.player.setFace('🤤');

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 100, '◀ 왼쪽 터치 = 세탁실 숨기 · 오른쪽 터치 = 전자레인지 ▶', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.subCss,
        wordWrap: { width: GAME_WIDTH - 60 },
        align: 'center',
      })
      .setOrigin(0.5);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y < 140) return; // 상단 UI(음소거 등) 영역 무시
      this.moveTo(pointer.x < GAME_WIDTH / 2 ? 'laundry' : 'micro');
    });

    this.setupCommon();
    this.cookTotalMs = Q3_MICROWAVE.cookMs(this.day);

    this.startSeniorLoop({
      params: () => ({
        gapMs: randRange(Q3_MICROWAVE.gapMsRange(this.day)),
        stayMs: randRange(Q3_MICROWAVE.stayMsRange(this.day)),
      }),
      onEnter: () => {
        this.seniorState = 'in';
        this.reacted = false;
        this.senior.setPosition(pick(SENIOR_SPOTS), 340);
        this.senior.setVisible(true);
        const reactMs = Q3_MICROWAVE.reactMs(this.day);
        this.time.delayedCall(reactMs, () => {
          if (this.finished || this.seniorState !== 'in') return;
          if (this.zone === 'laundry') {
            this.reacted = true;
          } else {
            this.fail('반응이 늦었다! 전자레인지 앞에 서 있는 걸 들켰다.');
          }
        });
      },
      onLeave: () => {
        this.seniorState = 'away';
        this.senior.setVisible(false);
      },
    });
  }

  private moveTo(zone: Zone): void {
    if (this.finished || this.zone === zone) return;
    this.zone = zone;
    const x = zone === 'laundry' ? LAUNDRY_X : MICRO_X;
    this.tweens.add({ targets: this.player, x, duration: 180, ease: 'Cubic.easeOut' });
    this.player.setFace(zone === 'laundry' ? '🫣' : '🤤');
  }

  protected tick(delta: number): void {
    // 반응에 성공해 세탁실로 피한 뒤, 다시 전자레인지 앞으로 돌아오면 발각
    if (this.seniorState === 'in' && this.reacted && this.zone === 'micro') {
      this.fail('전자레인지 앞에 서 있는 걸 선배에게 발각됐다!');
      return;
    }

    if (this.beeping) {
      this.beepElapsedMs += delta;
      if (this.seniorState === 'in') {
        this.fail('"삐-" 소리를 들은 선배가 전자레인지를 열어봤다...');
        return;
      }
      if (this.beepElapsedMs >= Q3_MICROWAVE.beepMs) {
        this.succeed('라면 획득! 흔적도 없이 순삭했다.');
      }
      return;
    }

    // 전자레인지 앞에 있을 때만 조리 진행
    if (this.zone === 'micro') {
      this.cookProgressMs += delta;
      if (this.cookProgressMs >= this.cookTotalMs) {
        this.beeping = true;
        this.beepElapsedMs = 0;
        this.beepText.setVisible(true);
        this.tweens.add({
          targets: this.beepText,
          scale: { from: 1, to: 1.3 },
          duration: 200,
          yoyo: true,
          repeat: 4,
        });
        audio.microwaveBeep();
      }
    }

    const ratio = Math.min(1, this.cookProgressMs / this.cookTotalMs);
    this.cookFill.clear();
    this.cookFill.fillStyle(ratio > 0.9 ? COLORS.accent : COLORS.warn, 1);
    this.cookFill.fillRoundedRect(GAME_WIDTH / 2 - 244, 86, 488 * ratio, 32, 7);
    this.cookLabel.setText(`조리 ${Math.floor(ratio * 100)}%`);
  }
}
