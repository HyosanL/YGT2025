import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { flushQueue } from '../core/Leaderboard';
import { IMAGE_KEYS } from '../assets/manifest';

/**
 * 에셋 로딩 + 로딩바.
 * 제미나이로 생성한 캐릭터/배경/소품 PNG(public/assets/img/)를 여기서 프리로드한다.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    const base = import.meta.env.BASE_URL || '/';
    for (const key of IMAGE_KEYS) {
      this.load.image(key, `${base}assets/img/${key}.png`);
    }

    const barBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 420, 26, 0x000000, 0.6);
    const bar = this.add
      .rectangle(GAME_WIDTH / 2 - 205, GAME_HEIGHT / 2, 0, 16, COLORS.accent)
      .setOrigin(0, 0.5);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, 'YGT 2025', {
        fontFamily: FONT,
        fontSize: '48px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      bar.width = 410 * value;
    });
    void barBg;
  }

  create(): void {
    // 오프라인 중 쌓인 리더보드 기록 재전송 (비동기, 실패해도 무시)
    void flushQueue();
    this.time.delayedCall(300, () => this.scene.start('Title'));
  }
}
