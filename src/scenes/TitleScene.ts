import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
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
      .text(GAME_WIDTH / 2, 420, 'YGT 2025', {
        fontFamily: FONT,
        fontSize: '96px',
        color: COLORS.textCss,
        // 밝은 연병장 배경 위에서도 읽히도록 굵은 검정 외곽선 (플랫 카툰 로고 느낌)
        stroke: COLORS.inkCss,
        strokeThickness: 10,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 505, '공사 2학년 생도의 생존기', {
        fontFamily: FONT,
        fontSize: '32px',
        color: COLORS.textCss,
        stroke: COLORS.inkCss,
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 560, '— 선배에게 걸리면 게임 오버 —', {
        fontFamily: FONT,
        fontSize: '26px',
        color: COLORS.warnCss,
        stroke: COLORS.inkCss,
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    // 하단 추격전 — 당직 선배가 뒤에서 쫓고 기태가 앞서 도망친다.
    // 스프라이트가 왼쪽을 보고 있으므로 **오른쪽에서 왼쪽으로** 달려야 뒷걸음질처럼 보이지 않는다.
    // 즉 진행 방향 기준 '뒤'는 오른쪽이라, 선배가 기태보다 오른쪽에서 출발한다.
    // 버튼 영역(마지막 버튼 아래끝 ~1120) 아래로 내려 화면 맨 아래 띠에만 머물게 한다.
    const laneY = GAME_HEIGHT - 92;
    const runner = new Cadet(this, GAME_WIDTH + 170, laneY, 'player');
    runner.setScale(0.52).setDepth(1);
    runner.setMotion('run'); // player_run / player_run_b 2프레임 — 손발이 교차한다
    const chaser = new Cadet(this, GAME_WIDTH + 430, laneY, 'senior');
    chaser.setScale(0.54).setDepth(1);
    chaser.setMotion('run'); // senior_run / senior_run_b 2프레임
    // 선배 쪽이 조금 더 멀리 가므로 갈수록 간격이 좁혀진다
    this.tweens.add({ targets: runner, x: -230, duration: 6200, repeat: -1 });
    this.tweens.add({ targets: chaser, x: -90, duration: 6200, repeat: -1 });

    if (gameState.bestDay > 0) {
      this.add
        .text(GAME_WIDTH / 2, 640, `내 최고 기록: ${gameState.bestDay}일차`, {
          fontFamily: FONT,
          fontSize: '30px',
          color: COLORS.warnCss,
        })
        .setOrigin(0.5);
    }

    new Button(this, GAME_WIDTH / 2, 706, {
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

    new Button(this, GAME_WIDTH / 2, 818, {
      label: '🏆 리더보드',
      width: 420,
      height: 92,
      onClick: () => this.toggleLeaderboard(),
    });

    new Button(this, GAME_WIDTH / 2, 918, {
      label: '📖 게임 설명',
      width: 420,
      height: 92,
      onClick: () => this.toggleHelp(),
    });

    new Button(this, GAME_WIDTH / 2, 1018, {
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
