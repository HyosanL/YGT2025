import Phaser from 'phaser';
import { LIVES_MAX } from '../config';

/**
 * 목숨 하트 바 — 3칸.
 * 빈 칸은 반투명 하트(🤍), 채워진 만큼 ❤️를 왼쪽부터 부분 크롭으로 표시한다.
 * ⅓ 목숨 = 하트가 ⅓만큼 채워진 모습 → 몇 칸 중 얼마나 찼는지 직관적으로 보인다.
 */
export class LivesBar extends Phaser.GameObjects.Container {
  private fills: Phaser.GameObjects.Text[] = [];
  private lastSixths = -1;

  constructor(scene: Phaser.Scene, x: number, y: number, size = 40) {
    super(scene, x, y);
    for (let i = 0; i < LIVES_MAX; i++) {
      const bx = i * (size + 12);
      const base = scene.add
        .text(bx, 0, '🤍', { fontSize: `${size}px` })
        .setAlpha(0.42);
      const fill = scene.add.text(bx, 0, '❤️', { fontSize: `${size}px` });
      this.add(base);
      this.add(fill);
      this.fills.push(fill);
    }
    this.setDepth(1000);
    scene.add.existing(this);
  }

  /** 전체 폭 (가운데 정렬 배치용) */
  static widthFor(size = 40): number {
    return LIVES_MAX * (size + 12) - 12 + size * 0.2;
  }

  /** @param sixths 목숨 (⅙ 단위 — 6 = 하트 1개) */
  setLives(sixths: number): void {
    if (sixths === this.lastSixths) return;
    this.lastSixths = sixths;
    this.fills.forEach((fill, i) => {
      const frac = Phaser.Math.Clamp(sixths / 6 - i, 0, 1);
      if (frac <= 0) {
        fill.setVisible(false);
        return;
      }
      fill.setVisible(true);
      if (frac >= 1) fill.setCrop();
      else fill.setCrop(0, 0, fill.width * frac, fill.height);
    });
  }
}
