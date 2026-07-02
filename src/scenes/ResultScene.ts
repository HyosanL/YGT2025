import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { audio } from '../core/AudioManager';
import { gameState } from '../core/GameState';
import { submitScore } from '../core/Leaderboard';
import { addMuteButton, Button, showToast } from '../ui/Button';
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
    } else {
      this.showGameOver(data);
    }
    addMuteButton(this);
  }

  private showSuccess(data: ResultSceneData): void {
    const clearedDay = gameState.day;
    gameState.completeDay();

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1c4a3e, 0x1c4a3e, COLORS.bg, COLORS.bg, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.add
      .text(GAME_WIDTH / 2, 340, '✅', { fontFamily: FONT, fontSize: '110px' })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 480, `${clearedDay}일차 클리어!`, {
        fontFamily: FONT,
        fontSize: '72px',
        color: COLORS.safeCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 580, data.reason, {
        fontFamily: FONT,
        fontSize: '32px',
        color: COLORS.subCss,
        wordWrap: { width: GAME_WIDTH - 100 },
        align: 'center',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 700, '내일은 더 위험하다...', {
        fontFamily: FONT,
        fontSize: '28px',
        color: COLORS.warnCss,
      })
      .setOrigin(0.5);

    new Button(this, GAME_WIDTH / 2, 880, {
      label: `${clearedDay + 1}일차로 ▶`,
      width: 420,
      height: 110,
      color: COLORS.accent,
      fontSize: 38,
      onClick: () => this.scene.start('DayIntro'),
    });
  }

  private showGameOver(data: ResultSceneData): void {
    const days = gameState.day;
    const playMs = Math.max(1, Math.round(gameState.totalPlayMs));
    gameState.gameOver();

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

    const submitBtn = new Button(this, GAME_WIDTH / 2, 850, {
      label: '🏆 리더보드에 등록',
      width: 460,
      height: 100,
      color: COLORS.panelLight,
      onClick: () => {
        void (async () => {
          const name = await askNickname(gameState.settings.nickname);
          if (!name) return;
          gameState.setNickname(name);
          submitBtn.setEnabled(false).setLabel('등록 중...');
          const result = await submitScore({ nickname: name, days, play_ms: playMs });
          if (result.ok) {
            submitBtn.setLabel(result.rank ? `등록 완료! 현재 ${result.rank}위` : '등록 완료!');
            audio.chime();
          } else if (result.queued) {
            submitBtn.setLabel('오프라인 — 다음 접속 시 자동 등록');
            showToast(this, '네트워크 연결 후 자동으로 재시도됩니다');
          } else {
            submitBtn.setEnabled(true).setLabel('🏆 리더보드에 등록');
            showToast(this, `등록 실패: ${result.error ?? '알 수 없는 오류'}`, COLORS.accentCss);
          }
        })();
      },
    });

    new Button(this, GAME_WIDTH / 2, 980, {
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
