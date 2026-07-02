import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { gameState } from '../core/GameState';
import { fetchTop } from '../core/Leaderboard';
import { addMuteButton, Button } from '../ui/Button';
import { askNickname } from '../utils/nicknameDialog';

export class TitleScene extends Phaser.Scene {
  private lbPanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: 'Title' });
  }

  create(): void {
    this.lbPanel = null;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0f3460, 0x0f3460, COLORS.bg, COLORS.bg, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 별(장식)
    for (let i = 0; i < 40; i++) {
      const star = this.add.circle(
        Math.random() * GAME_WIDTH,
        Math.random() * GAME_HEIGHT * 0.5,
        Math.random() * 2 + 1,
        0xffffff,
        Math.random() * 0.6 + 0.2
      );
      this.tweens.add({
        targets: star,
        alpha: 0.1,
        duration: 800 + Math.random() * 1500,
        yoyo: true,
        repeat: -1,
      });
    }

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

    if (gameState.bestDay > 0) {
      this.add
        .text(GAME_WIDTH / 2, 640, `내 최고 기록: ${gameState.bestDay}일차`, {
          fontFamily: FONT,
          fontSize: '30px',
          color: COLORS.warnCss,
        })
        .setOrigin(0.5);
    }

    new Button(this, GAME_WIDTH / 2, 780, {
      label: '▶ 게임 시작',
      width: 420,
      height: 110,
      color: COLORS.accent,
      fontSize: 40,
      onClick: () => {
        gameState.newRun();
        this.scene.start('DayIntro');
      },
    });

    new Button(this, GAME_WIDTH / 2, 920, {
      label: '🏆 리더보드',
      width: 420,
      height: 96,
      onClick: () => this.toggleLeaderboard(),
    });

    new Button(this, GAME_WIDTH / 2, 1045, {
      label: '✏️ 닉네임 설정',
      width: 420,
      height: 96,
      onClick: () => {
        void askNickname(gameState.settings.nickname).then((name) => {
          if (name) gameState.setNickname(name);
        });
      },
    });

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 40, 'v0.1.0 — 몰래 하다가 들키기 직전에 멈춰라', {
        fontFamily: FONT,
        fontSize: '22px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5);

    addMuteButton(this);
  }

  private toggleLeaderboard(): void {
    if (this.lbPanel) {
      this.lbPanel.destroy();
      this.lbPanel = null;
      return;
    }

    const panel = this.add.container(0, 0).setDepth(3000);
    this.lbPanel = panel;

    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setOrigin(0)
      .setInteractive();
    panel.add(dim);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.panel, 0.97);
    bg.fillRoundedRect(50, 160, GAME_WIDTH - 100, 900, 24);
    panel.add(bg);

    panel.add(
      this.add
        .text(GAME_WIDTH / 2, 220, '🏆 리더보드 TOP 10', {
          fontFamily: FONT,
          fontSize: '40px',
          color: COLORS.textCss,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
    );

    const status = this.add
      .text(GAME_WIDTH / 2, 560, '불러오는 중...', {
        fontFamily: FONT,
        fontSize: '30px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5);
    panel.add(status);

    const closeBtn = new Button(this, GAME_WIDTH / 2, 980, {
      label: '닫기',
      width: 280,
      height: 90,
      onClick: () => {
        panel.destroy();
        this.lbPanel = null;
      },
    });
    panel.add(closeBtn);

    void fetchTop().then((entries) => {
      if (!panel.active || panel !== this.lbPanel) return;
      if (!entries) {
        status.setText(
          `오프라인이거나 서버에 연결할 수 없어요.\n\n내 최고 기록: ${gameState.bestDay}일차`
        );
        return;
      }
      status.destroy();
      if (entries.length === 0) {
        panel.add(
          this.add
            .text(GAME_WIDTH / 2, 560, '아직 기록이 없어요.\n첫 번째 생존자가 되어보세요!', {
              fontFamily: FONT,
              fontSize: '30px',
              color: COLORS.subCss,
              align: 'center',
            })
            .setOrigin(0.5)
        );
        return;
      }
      entries.slice(0, 10).forEach((e, i) => {
        const rankColor = i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : COLORS.textCss;
        const seconds = Math.round(e.play_ms / 1000);
        panel.add(
          this.add
            .text(110, 290 + i * 62, `${i + 1}.`, {
              fontFamily: FONT,
              fontSize: '30px',
              color: rankColor,
              fontStyle: 'bold',
            })
            .setOrigin(0, 0.5)
        );
        panel.add(
          this.add
            .text(180, 290 + i * 62, e.nickname, {
              fontFamily: FONT,
              fontSize: '30px',
              color: rankColor,
            })
            .setOrigin(0, 0.5)
        );
        panel.add(
          this.add
            .text(GAME_WIDTH - 110, 290 + i * 62, `${e.days}일차 · ${seconds}초`, {
              fontFamily: FONT,
              fontSize: '28px',
              color: COLORS.subCss,
            })
            .setOrigin(1, 0.5)
        );
      });
    });
  }
}
