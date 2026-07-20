import Phaser from 'phaser';
import { COLORS, FONT, GAME_WIDTH } from '../config';
import { audio } from '../core/AudioManager';
import { gameState } from '../core/GameState';
import { Button, showToast } from '../ui/Button';
import { Cadet } from '../ui/Characters';
import { showHelpPanel } from '../ui/HelpPanel';
import { showLeaderboardPanel } from '../ui/LeaderboardPanel';
import { addSceneBg } from '../ui/Scenery';
import { addVolumeButton } from '../ui/VolumePanel';
import { askNickname } from '../utils/nicknameDialog';

interface TitleSceneData {
  /** 연습 종료 후 복귀 — 게임설명 패널을 바로 연다 */
  openHelp?: boolean;
  /** 연습 결과 토스트 문구 */
  practiceMsg?: string;
}

export class TitleScene extends Phaser.Scene {
  private lbPanel: Phaser.GameObjects.Container | null = null;
  private helpPanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: 'Title' });
  }

  create(data?: TitleSceneData): void {
    this.lbPanel = null;
    this.helpPanel = null;
    gameState.endPractice(); // 어떤 경로로 돌아왔든 연습 플래그 정리
    audio.setBgmTempo(1); // 타이틀은 항상 원래 템포
    audio.startBgm('title');

    // 연습 종료 복귀 — 설명 패널을 다시 열고 결과를 알려준다
    if (data?.openHelp) {
      this.time.delayedCall(50, () => this.toggleHelp());
    }
    if (data?.practiceMsg) {
      const msg = data.practiceMsg;
      this.time.delayedCall(250, () => showToast(this, msg));
    }

    // 첫 실행이면 닉네임부터 정하고 시작한다
    if (!gameState.settings.nickname) {
      this.time.delayedCall(450, () => {
        if (gameState.settings.nickname) return;
        void askNickname('', '어서 와, 생도! 닉네임부터 정하자 (1~12자)').then((name) => {
          if (name) gameState.setNickname(name);
        });
      });
    }

    addSceneBg(this, 'bg_title');

    this.add
      .text(GAME_WIDTH / 2, 300, '✈️', { fontFamily: FONT, fontSize: '90px' })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 420, 'YGT 2025', {
        fontFamily: FONT,
        fontSize: '96px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 505, '공사 2학년 생도 기태의 생존기', {
        fontFamily: FONT,
        fontSize: '32px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 560, '— 선배에게 걸리면 게임 오버 —', {
        fontFamily: FONT,
        fontSize: '26px',
        color: COLORS.accentCss,
      })
      .setOrigin(0.5);

    // 하단 추격전 — 기태는 오늘도 도망 중 (버튼보다 먼저 생성해 뒤에 깔린다)
    const runner = new Cadet(this, -140, 1155, 'player');
    runner.setScale(0.6);
    runner.setMotion('run');
    runner.setFace('😆');
    const chaser = new Cadet(this, -400, 1155, 'senior');
    chaser.setScale(0.62);
    chaser.setMotion('run');
    chaser.setFace('😡');
    // 선배 쪽이 살짝 빨라서 갈수록 간격이 좁혀진다
    this.tweens.add({ targets: runner, x: GAME_WIDTH + 260, duration: 6000, repeat: -1 });
    this.tweens.add({ targets: chaser, x: GAME_WIDTH + 40, duration: 6000, repeat: -1 });

    if (gameState.bestDay > 0) {
      this.add
        .text(GAME_WIDTH / 2, 640, `내 최고 기록: ${gameState.bestDay}일차`, {
          fontFamily: FONT,
          fontSize: '30px',
          color: COLORS.warnCss,
        })
        .setOrigin(0.5);
    }

    new Button(this, GAME_WIDTH / 2, 740, {
      label: '▶ 게임 시작',
      width: 420,
      height: 104,
      color: COLORS.accent,
      fontSize: 40,
      onClick: () => {
        gameState.newRun();
        this.scene.start('DayIntro');
      },
    });

    new Button(this, GAME_WIDTH / 2, 858, {
      label: '🏆 리더보드',
      width: 420,
      height: 92,
      onClick: () => this.toggleLeaderboard(),
    });

    new Button(this, GAME_WIDTH / 2, 966, {
      label: '📖 게임 설명',
      width: 420,
      height: 92,
      onClick: () => this.toggleHelp(),
    });

    new Button(this, GAME_WIDTH / 2, 1074, {
      label: '✏️ 닉네임 설정',
      width: 420,
      height: 92,
      onClick: () => {
        void askNickname(gameState.settings.nickname).then((name) => {
          if (name) gameState.setNickname(name);
        });
      },
    });

    // 우측 상단 소리 아이콘 — 음소거 토글 대신 '소리 설정' 패널을 연다 (역할 전환)
    addVolumeButton(this);
  }

  private toggleHelp(): void {
    if (this.helpPanel) {
      this.helpPanel.destroy();
      this.helpPanel = null;
      return;
    }
    this.helpPanel = showHelpPanel(this, () => {
      this.helpPanel = null;
    });
  }

  private toggleLeaderboard(): void {
    if (this.lbPanel) {
      this.lbPanel.destroy();
      this.lbPanel = null;
      return;
    }
    this.lbPanel = showLeaderboardPanel(this, gameState.settings.nickname, () => {
      this.lbPanel = null;
    });
  }
}
