import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { audio } from '../core/AudioManager';
import { addMuteButton, Button } from '../ui/Button';

export interface PauseSceneData {
  /** 카운트다운이 끝나면 resume할 씬 키 */
  returnTo: string;
  /** 'menu' = 일시정지 메뉴, 'countdown' = 즉시 카운트다운 (미니퀘스트 복귀용) */
  mode: 'menu' | 'countdown';
  /** 카운트다운 시작 숫자 (기본: menu 3 / countdown 2) */
  count?: number;
  /** 카운트다운 위에 띄울 안내 문구 */
  label?: string;
}

/**
 * 일시정지 오버레이 + 재개 카운트다운.
 * 메인 씬을 pause한 위에 launch되며, 카운트다운이 끝나야 resume한다.
 * 카운트 중에는 뒤의 판이 흐리게 보여 손가락을 미리 자리잡을 수 있다.
 */
export class PauseScene extends Phaser.Scene {
  private returnTo = '';
  private menuItems: Phaser.GameObjects.GameObject[] = [];
  private counting = false;

  constructor() {
    super({ key: 'Pause' });
  }

  create(data: PauseSceneData): void {
    this.returnTo = data.returnTo;
    this.menuItems = [];
    this.counting = false;

    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55)
      .setOrigin(0)
      .setInteractive(); // 하위 씬으로의 입력 차단
    void dim;

    if (data.mode === 'menu') {
      this.buildMenu();
      addMuteButton(this);
    } else {
      this.startCountdown(data.count ?? 2, data.label ?? '곧 재개!');
    }
  }

  private buildMenu(): void {
    const title = this.add
      .text(GAME_WIDTH / 2, 420, '⏸ 일시정지', {
        fontFamily: FONT,
        fontSize: '72px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const resumeBtn = new Button(this, GAME_WIDTH / 2, 620, {
      label: '▶ 계속하기',
      width: 440,
      height: 120,
      color: COLORS.safe,
      fontSize: 40,
      onClick: () => this.startCountdown(3, '준비!'),
    });

    const quitBtn = new Button(this, GAME_WIDTH / 2, 780, {
      label: '🏳 포기하고 타이틀로',
      width: 440,
      height: 100,
      color: COLORS.panelLight,
      fontSize: 30,
      onClick: () => {
        audio.stopAll();
        this.scene.stop(this.returnTo);
        this.scene.start('Title');
      },
    });

    this.menuItems = [title, resumeBtn, quitBtn];
  }

  /** N → ... → 1 → GO! 후 메인 씬 resume */
  private startCountdown(from: number, label: string): void {
    if (this.counting) return;
    this.counting = true;
    for (const item of this.menuItems) item.destroy();
    this.menuItems = [];

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 190, label, {
        fontFamily: FONT,
        fontSize: '40px',
        color: COLORS.subCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const numText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
        fontFamily: FONT,
        fontSize: '170px',
        color: COLORS.warnCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const tickMs = 900;
    const showNumber = (n: number): void => {
      if (n <= 0) {
        numText.setText('GO!').setColor(COLORS.safeCss).setScale(0.6);
        audio.chime();
        this.tweens.add({ targets: numText, scale: 1.2, duration: 200, ease: 'Back.easeOut' });
        this.time.delayedCall(350, () => {
          this.scene.resume(this.returnTo);
          this.scene.stop();
        });
        return;
      }
      numText.setText(`${n}`).setColor(COLORS.warnCss).setScale(1.4).setAlpha(0.4);
      audio.tick();
      this.tweens.add({ targets: numText, scale: 1, alpha: 1, duration: 220, ease: 'Cubic.easeOut' });
      this.time.delayedCall(tickMs, () => showNumber(n - 1));
    };
    showNumber(from);
  }
}
