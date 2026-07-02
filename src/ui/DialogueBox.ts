import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import type { DialogueLine } from '../types';

const BOX_H = GAME_HEIGHT * 0.3;
const BOX_Y = GAME_HEIGHT - BOX_H;
const PAD = 36;
const CHAR_INTERVAL_MS = 28;

/**
 * 미연시풍 대사창 — 하단 30%, 반투명 검정 + 이름표 + 타이핑 효과.
 * 탭: 타이핑 중이면 즉시 완성, 아니면 다음 대사. 마지막 대사 후 onDone.
 */
export class DialogueBox extends Phaser.GameObjects.Container {
  private nameTag: Phaser.GameObjects.Text;
  private bodyText: Phaser.GameObjects.Text;
  private nextIndicator: Phaser.GameObjects.Text;
  private lines: DialogueLine[] = [];
  private lineIndex = 0;
  private charIndex = 0;
  private typing = false;
  private typeTimer: Phaser.Time.TimerEvent | null = null;
  private onDone: (() => void) | null = null;
  private tapZone: Phaser.GameObjects.Zone;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);

    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.78);
    bg.fillRoundedRect(16, BOX_Y, GAME_WIDTH - 32, BOX_H - 24, 24);
    bg.lineStyle(2, COLORS.white, 0.2);
    bg.strokeRoundedRect(16, BOX_Y, GAME_WIDTH - 32, BOX_H - 24, 24);
    this.add(bg);

    const tagBg = scene.add.graphics();
    tagBg.fillStyle(COLORS.accent, 1);
    tagBg.fillRoundedRect(36, BOX_Y - 28, 180, 56, 14);
    this.add(tagBg);

    this.nameTag = scene.add
      .text(36 + 90, BOX_Y, '', {
        fontFamily: FONT,
        fontSize: '30px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add(this.nameTag);

    this.bodyText = scene.add.text(16 + PAD, BOX_Y + 56, '', {
      fontFamily: FONT,
      fontSize: '32px',
      color: COLORS.textCss,
      wordWrap: { width: GAME_WIDTH - 32 - PAD * 2 },
      lineSpacing: 12,
    });
    this.add(this.bodyText);

    this.nextIndicator = scene.add
      .text(GAME_WIDTH - 60, GAME_HEIGHT - 64, '▼', {
        fontFamily: FONT,
        fontSize: '30px',
        color: COLORS.accentCss,
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.add(this.nextIndicator);
    scene.tweens.add({
      targets: this.nextIndicator,
      y: GAME_HEIGHT - 56,
      duration: 450,
      yoyo: true,
      repeat: -1,
    });

    // 전체 화면 탭으로 진행
    this.tapZone = scene.add
      .zone(0, 0, GAME_WIDTH, GAME_HEIGHT)
      .setOrigin(0)
      .setInteractive();
    this.tapZone.on('pointerdown', () => this.handleTap());

    this.setDepth(2000);
    this.setVisible(false);
    scene.add.existing(this);
  }

  showLines(lines: DialogueLine[], onDone: () => void): void {
    this.lines = lines;
    this.lineIndex = 0;
    this.onDone = onDone;
    this.setVisible(true);
    this.startLine();
  }

  private startLine(): void {
    const line = this.lines[this.lineIndex];
    this.nameTag.setText(line.name);
    this.bodyText.setText('');
    this.charIndex = 0;
    this.typing = true;
    this.nextIndicator.setVisible(false);
    this.typeTimer?.remove();
    this.typeTimer = this.scene.time.addEvent({
      delay: CHAR_INTERVAL_MS,
      repeat: line.text.length - 1,
      callback: () => {
        this.charIndex += 1;
        this.bodyText.setText(line.text.slice(0, this.charIndex));
        if (this.charIndex >= line.text.length) this.finishTyping();
      },
    });
  }

  private finishTyping(): void {
    this.typing = false;
    this.typeTimer?.remove();
    this.typeTimer = null;
    const line = this.lines[this.lineIndex];
    this.bodyText.setText(line.text);
    this.nextIndicator.setVisible(true);
  }

  private handleTap(): void {
    if (!this.visible) return;
    if (this.typing) {
      this.finishTyping();
      return;
    }
    this.lineIndex += 1;
    if (this.lineIndex < this.lines.length) {
      this.startLine();
    } else {
      this.setVisible(false);
      this.tapZone.disableInteractive();
      const done = this.onDone;
      this.onDone = null;
      done?.();
    }
  }
}
