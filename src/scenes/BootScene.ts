import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { flushQueue } from '../core/Leaderboard';

/**
 * 에셋 로딩 + 로딩바.
 * 현재 버전은 모든 그래픽/사운드를 절차 생성하므로 외부 로딩이 없다 —
 * 추후 사용자 제공 에셋(음원, 카톡 캡처)을 preload에 추가하면 로딩바가 실제로 동작한다.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
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
