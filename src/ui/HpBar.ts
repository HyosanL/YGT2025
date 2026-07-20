import Phaser from 'phaser';
import { COLORS, FONT, HP_MAX } from '../config';

const BAR_W = 300;
const BAR_H = 30;

/**
 * 좌상단 HP 바. setHp로 갱신 — 감소 시 붉게 번쩍.
 */
export class HpBar extends Phaser.GameObjects.Container {
  private fill: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private lastHp = -1;

  constructor(scene: Phaser.Scene, x = 24, y = 24) {
    super(scene, x, y);

    const bg = scene.add.graphics();
    bg.fillStyle(0x14141a, 0.7);
    bg.fillRoundedRect(0, 0, BAR_W + 8, BAR_H + 8, 9);
    bg.lineStyle(3.5, 0x14141a, 1);
    bg.strokeRoundedRect(0, 0, BAR_W + 8, BAR_H + 8, 9);
    this.add(bg);

    this.fill = scene.add.graphics();
    this.add(this.fill);

    this.label = scene.add
      .text(BAR_W / 2 + 4, BAR_H / 2 + 4, '', {
        fontFamily: FONT,
        fontSize: '22px',
        color: COLORS.textCss,
        fontStyle: 'bold',
        stroke: '#14141a',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.add(this.label);

    this.setDepth(1000);
    scene.add.existing(this);
    this.setHp(HP_MAX);
  }

  setHp(hp: number): void {
    if (hp === this.lastHp) return;
    const shown = Math.max(0, Math.ceil(hp));
    const ratio = Math.max(0, Math.min(1, hp / HP_MAX));
    const color = ratio > 0.5 ? COLORS.safe : ratio > 0.25 ? COLORS.warn : COLORS.accent;
    this.fill.clear();
    this.fill.fillStyle(color, 1);
    if (ratio > 0) {
      this.fill.fillRoundedRect(4, 4, BAR_W * ratio, BAR_H, 6);
    }
    this.label.setText(`HP ${shown}`);

    if (shown < Math.ceil(this.lastHp)) {
      this.scene.tweens.add({
        targets: this,
        alpha: { from: 0.3, to: 1 },
        duration: 200,
        yoyo: false,
      });
    }
    this.lastHp = hp;
  }
}
