import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { audio } from '../core/AudioManager';
import { gameState } from '../core/GameState';
import { submitScore } from '../core/Leaderboard';
import { addMuteButton, Button } from '../ui/Button';
import { showLeaderboardPanel } from '../ui/LeaderboardPanel';
import { askNickname } from '../utils/nicknameDialog';
import type { ResultSceneData } from '../types';

/**
 * 성공/실패 연출. 게임오버 시 생존 일수를 온라인 리더보드에 등록.
 */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Result' });
  }

  create(data: ResultSceneData): void {
    audio.stopAll();
    if (data.success) {
      this.showSuccess(data);
    } else if (gameState.tryRevive()) {
      // 목숨이 남아 있다 — 1칸 소모하고 같은 날 아침으로 부활
      this.showRevive(data);
    } else {
      this.showGameOver(data);
    }
    addMuteButton(this);
  }

  /** 부활 연출 — 목숨 1칸을 쓰고 같은 일차를 다시 시작한다 */
  private showRevive(data: ResultSceneData): void {
    let advanced = false;
    const advance = (): void => {
      if (advanced) return;
      advanced = true;
      this.scene.start('DayIntro');
    };

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2a1c4a, 0x2a1c4a, 0x0d0d16, 0x0d0d16, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.add
      .text(GAME_WIDTH / 2, 470, data.reason, {
        fontFamily: FONT,
        fontSize: '28px',
        color: COLORS.subCss,
        wordWrap: { width: GAME_WIDTH - 100 },
        align: 'center',
      })
      .setOrigin(0.5);

    const heart = this.add
      .text(GAME_WIDTH / 2, 360, '💫', { fontFamily: FONT, fontSize: '110px' })
      .setOrigin(0.5)
      .setScale(0.3);
    this.tweens.add({ targets: heart, scale: 1, duration: 300, ease: 'Back.easeOut' });

    this.add
      .text(GAME_WIDTH / 2, 590, '목숨 하나를 사용했다!', {
        fontFamily: FONT,
        fontSize: '54px',
        color: COLORS.warnCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 670, `남은 목숨  ${gameState.livesDisplay}`, {
        fontFamily: FONT,
        fontSize: '36px',
        color: COLORS.textCss,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 770, `${gameState.day}일차, 다시 아침이 밝는다...`, {
        fontFamily: FONT,
        fontSize: '30px',
        color: COLORS.safeCss,
      })
      .setOrigin(0.5);

    audio.chime();
    this.time.delayedCall(1800, advance);
    this.input.once('pointerdown', advance);
  }

  private showSuccess(data: ResultSceneData): void {
    const clearedDay = gameState.day;
    gameState.completeDay();
    let advanced = false;
    const advance = (): void => {
      if (advanced) return;
      advanced = true;
      this.scene.start('DayIntro');
    };

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1c4a3e, 0x1c4a3e, COLORS.bg, COLORS.bg, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const badge = this.add
      .text(GAME_WIDTH / 2, 380, '✅', { fontFamily: FONT, fontSize: '110px' })
      .setOrigin(0.5)
      .setScale(0.3);
    this.tweens.add({ targets: badge, scale: 1, duration: 250, ease: 'Back.easeOut' });
    this.add
      .text(GAME_WIDTH / 2, 520, `${clearedDay}일차 클리어!`, {
        fontFamily: FONT,
        fontSize: '72px',
        color: COLORS.safeCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 620, data.reason, {
        fontFamily: FONT,
        fontSize: '32px',
        color: COLORS.subCss,
        wordWrap: { width: GAME_WIDTH - 100 },
        align: 'center',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 740, '내일은 더 위험하다...', {
        fontFamily: FONT,
        fontSize: '28px',
        color: COLORS.warnCss,
      })
      .setOrigin(0.5);

    // 축하 꽃가루
    this.add.particles(0, 0, '__WHITE', {
      x: { min: 0, max: GAME_WIDTH },
      y: -20,
      speedY: { min: 220, max: 420 },
      speedX: { min: -60, max: 60 },
      rotate: { min: 0, max: 360 },
      scale: { start: 1.9, end: 1.1 },
      alpha: { start: 1, end: 0.4 },
      lifespan: 2200,
      quantity: 2,
      tint: [0x4ecca3, 0xffd700, 0xe94560, 0x4a90d9, 0xf5f5f5],
    });

    // 리듬 유지 — 탭 없이 자동으로 다음 날로 (탭하면 즉시)
    this.time.delayedCall(1200, advance);
    this.input.once('pointerdown', advance);
  }

  private showGameOver(data: ResultSceneData): void {
    const days = gameState.day;
    // gameOver()가 마지막 날 구간을 totalPlayMs에 합산하므로, 시간은 그 뒤에 읽는다
    const isBest = gameState.gameOver();
    const playMs = Math.max(1, Math.round(gameState.totalPlayMs));

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x4a1c2a, 0x4a1c2a, 0x0d0d16, 0x0d0d16, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.add
      .text(GAME_WIDTH / 2, 280, '☠️', { fontFamily: FONT, fontSize: '110px' })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 420, '게 임 오 버', {
        fontFamily: FONT,
        fontSize: '84px',
        color: COLORS.accentCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 530, data.reason, {
        fontFamily: FONT,
        fontSize: '32px',
        color: COLORS.textCss,
        wordWrap: { width: GAME_WIDTH - 100 },
        align: 'center',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 592, '🖤🖤🖤 목숨을 모두 소진했다', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 650, `생존 기록: ${days}일차`, {
        fontFamily: FONT,
        fontSize: '48px',
        color: COLORS.warnCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 715, `플레이 시간 ${Math.round(playMs / 1000)}초`, {
        fontFamily: FONT,
        fontSize: '26px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5);

    // 신기록이면 자동 등록 — 수동 등록 버튼은 없다 (최고 기록만 서버에 올라간다)
    const statusText = this.add
      .text(GAME_WIDTH / 2, 780, '', {
        fontFamily: FONT,
        fontSize: '26px',
        color: COLORS.warnCss,
        align: 'center',
      })
      .setOrigin(0.5);

    if (isBest) {
      const doSubmit = (nickname: string): void => {
        statusText.setText('🏆 신기록! 리더보드에 자동 등록 중...');
        void submitScore({ nickname, days, play_ms: playMs }).then((result) => {
          if (!statusText.active) return;
          if (result.ok) {
            audio.chime();
            statusText.setText(
              result.rank ? `🏆 신기록 등록 완료 — 현재 ${result.rank}위!` : '🏆 신기록 등록 완료!'
            );
          } else if (result.queued) {
            statusText.setText('🏆 신기록! 오프라인 — 다음 접속 시 자동 등록됩니다');
          } else {
            statusText.setText(`등록 실패: ${result.error ?? '알 수 없는 오류'}`);
          }
        });
      };
      const nick = gameState.settings.nickname;
      if (nick) {
        doSubmit(nick);
      } else {
        void askNickname('', '신기록! 리더보드에 올릴 닉네임 (1~12자)').then((name) => {
          if (name) {
            gameState.setNickname(name);
            doSubmit(name);
          } else {
            statusText.setText('닉네임을 정하면 신기록이 리더보드에 올라가요');
          }
        });
      }
    }

    let lbPanel: Phaser.GameObjects.Container | null = null;
    new Button(this, GAME_WIDTH / 2, 870, {
      label: '🏆 리더보드 보기 (내 등수)',
      width: 460,
      height: 100,
      color: COLORS.panelLight,
      onClick: () => {
        if (lbPanel?.active) return;
        lbPanel = showLeaderboardPanel(this, gameState.settings.nickname, () => {
          lbPanel = null;
        });
      },
    });

    new Button(this, GAME_WIDTH / 2, 995, {
      label: '🔄 다시 도전',
      width: 460,
      height: 100,
      color: COLORS.accent,
      onClick: () => {
        gameState.newRun();
        this.scene.start('DayIntro');
      },
    });

    new Button(this, GAME_WIDTH / 2, GAME_HEIGHT - 170, {
      label: '타이틀로',
      width: 460,
      height: 92,
      onClick: () => this.scene.start('Title'),
    });
  }
}
