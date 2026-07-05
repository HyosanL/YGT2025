import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { audio } from '../core/AudioManager';
import { gameState } from '../core/GameState';
import { Button } from '../ui/Button';
import { showVolumePanel } from '../ui/VolumePanel';

export interface PauseSceneData {
  /** 카운트다운이 끝나면 resume할 씬 키 */
  returnTo: string;
  /** 'menu' = 일시정지 메뉴, 'countdown' = 즉시 카운트다운 (미니퀘스트 복귀용) */
  mode: 'menu' | 'countdown';
  /** 카운트다운 시작 숫자 (기본 3) */
  count?: number;
  /** 카운트다운 위에 띄울 안내 문구 */
  label?: string;
  /** 메뉴 진입 즉시 소리 설정 패널을 연다 (인게임 🔊 버튼 경로) */
  openVolume?: boolean;
}

/**
 * 일시정지 오버레이 + 재개 카운트다운.
 * 메인 씬을 pause한 위에 launch되며, 카운트다운이 끝나야 resume한다.
 * 회색 반투명 처리라 뒤의 판이 보여 손가락을 미리 자리잡을 수 있다.
 * 카운트다운은 3→2→1→시작! 총 ~1.7초의 빠른 템포.
 */
export class PauseScene extends Phaser.Scene {
  private returnTo = '';
  private menuItems: Phaser.GameObjects.GameObject[] = [];
  private counting = false;
  private volPanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: 'Pause' });
  }

  create(data: PauseSceneData): void {
    this.returnTo = data.returnTo;
    this.menuItems = [];
    this.counting = false;
    this.volPanel = null;
    // 등록 순서와 무관하게 반드시 최상단에 렌더링 (게임 씬에 가려짐 방지)
    this.scene.bringToTop();

    // 회색 처리 — 뒤의 판이 톤 다운되어 보인다
    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x585c68, 0.6)
      .setOrigin(0)
      .setInteractive(); // 하위 씬으로의 입력 차단
    void dim;

    if (data.mode === 'menu') {
      this.buildMenu();
      if (data.openVolume) this.openVolume();
    } else {
      this.startCountdown(data.count ?? 3, data.label ?? '곧 재개!');
    }
  }

  /** 소리 설정 — 조절하는 동안은 들리게 잠깐 무음을 풀고, 닫으면 다시 무음 */
  private openVolume(): void {
    if (this.volPanel) return;
    audio.setPauseMuted(false);
    this.volPanel = showVolumePanel(this, () => {
      this.volPanel = null;
      audio.setPauseMuted(true);
    });
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

    const volumeBtn = new Button(this, GAME_WIDTH / 2, 760, {
      label: '🔊 소리 설정',
      width: 440,
      height: 96,
      color: COLORS.panelLight,
      fontSize: 32,
      onClick: () => this.openVolume(),
    });

    const quitBtn = new Button(this, GAME_WIDTH / 2, 890, {
      label: '🏳 포기하고 타이틀로',
      width: 440,
      height: 96,
      color: COLORS.panelLight,
      fontSize: 30,
      onClick: () => {
        // 일시정지가 걸어둔 시계 홀드/무음 해제 (씬을 resume하지 않고 떠나는 경로)
        gameState.releaseClock();
        audio.setPauseMuted(false);
        audio.stopAll();
        this.scene.stop(this.returnTo);
        this.scene.start('Title');
      },
    });

    this.menuItems = [title, resumeBtn, volumeBtn, quitBtn];
  }

  /** N → ... → 1 → 시작! 총 ~1.7초의 빠른 카운트다운 후 메인 씬 resume */
  private startCountdown(from: number, label: string): void {
    if (this.counting) return;
    this.counting = true;
    // 재개 준비 — 일시정지 무음 해제 (카운트다운 틱부터 들린다)
    audio.setPauseMuted(false);
    for (const item of this.menuItems) item.destroy();
    this.menuItems = [];

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 220, label, {
        fontFamily: FONT,
        fontSize: '44px',
        color: COLORS.textCss,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    // 화면 정중앙, 아주 큰 숫자
    const numText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
        fontFamily: FONT,
        fontSize: '220px',
        color: COLORS.warnCss,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 10,
      })
      .setOrigin(0.5);

    const tickMs = 480;
    const showNumber = (n: number): void => {
      if (n <= 0) {
        numText.setText('시작!').setColor(COLORS.safeCss).setScale(0.5);
        audio.chime();
        this.tweens.add({ targets: numText, scale: 0.85, duration: 160, ease: 'Back.easeOut' });
        this.time.delayedCall(300, () => {
          this.scene.resume(this.returnTo);
          this.scene.stop();
        });
        return;
      }
      numText.setText(`${n}`).setColor(COLORS.warnCss).setScale(1.3).setAlpha(0.5);
      audio.tick();
      this.tweens.add({ targets: numText, scale: 1, alpha: 1, duration: 160, ease: 'Cubic.easeOut' });
      this.time.delayedCall(tickMs, () => showNumber(n - 1));
    };
    showNumber(from);
  }
}
