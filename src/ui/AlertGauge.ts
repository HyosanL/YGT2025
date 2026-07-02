import Phaser from 'phaser';
import { COLORS, FONT } from '../config';

const GAUGE_W = 260;
const GAUGE_H = 22;

/**
 * 선배 등장 경고 게이지.
 * 전조(warn) 동안 show() → setProgress(0→1)로 차오르고, 위험 시 붉게 점멸.
 */
export class AlertGauge extends Phaser.GameObjects.Container {
  private fill: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Text;
  private pulseTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.icon = scene.add
      .text(-GAUGE_W / 2 - 16, 0, '⚠️', { fontFamily: FONT, fontSize: '36px' })
      .setOrigin(1, 0.5);
    this.add(this.icon);

    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.55);
    bg.fillRoundedRect(-GAUGE_W / 2 - 4, -GAUGE_H / 2 - 4, GAUGE_W + 8, GAUGE_H + 8, 6);
    this.add(bg);

    this.fill = scene.add.graphics();
    this.add(this.fill);

    this.setDepth(900);
    this.setVisible(false);
    scene.add.existing(this);
  }

  show(): void {
    this.setVisible(true);
    this.setAlpha(1);
    this.setProgress(0);
    this.pulseTween = this.scene.tweens.add({
      targets: this.icon,
      scale: { from: 1, to: 1.35 },
      duration: 220,
      yoyo: true,
      repeat: -1,
    });
  }

  setProgress(t: number): void {
    const ratio = Math.max(0, Math.min(1, t));
    this.fill.clear();
    const color = ratio > 0.66 ? COLORS.accent : COLORS.warn;
    this.fill.fillStyle(color, 1);
    if (ratio > 0) {
      this.fill.fillRoundedRect(-GAUGE_W / 2, -GAUGE_H / 2, GAUGE_W * ratio, GAUGE_H, 5);
    }
  }

  hide(): void {
    this.pulseTween?.remove();
    this.pulseTween = null;
    this.icon.setScale(1);
    this.setVisible(false);
  }
}
