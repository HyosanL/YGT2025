import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { audio } from '../core/AudioManager';
import { gameState } from '../core/GameState';
import { addMuteButton, Button } from '../ui/Button';
import { Cadet } from '../ui/Characters';
import { showLeaderboardPanel } from '../ui/LeaderboardPanel';
import { drawBarracks, drawFlagpole, drawMountains } from '../ui/Scenery';
import { askNickname } from '../utils/nicknameDialog';

export class TitleScene extends Phaser.Scene {
  private lbPanel: Phaser.GameObjects.Container | null = null;
  private helpPanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: 'Title' });
  }

  create(): void {
    this.lbPanel = null;
    this.helpPanel = null;
    audio.setBgmTempo(1); // 타이틀은 항상 원래 템포
    audio.startBgm('title');

    // 첫 실행이면 닉네임부터 정하고 시작한다
    if (!gameState.settings.nickname) {
      this.time.delayedCall(450, () => {
        if (gameState.settings.nickname) return;
        void askNickname('', '어서 와, 생도! 닉네임부터 정하자 (1~12자)').then((name) => {
          if (name) gameState.setNickname(name);
        });
      });
    }

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

    // 달 + 야간 연병장 실루엣
    const moon = this.add.graphics();
    moon.fillStyle(0xfff6d8, 0.1);
    moon.fillCircle(580, 170, 62);
    moon.fillStyle(0xfff6d8, 1);
    moon.fillCircle(580, 170, 34);
    drawMountains(this, 1120, 210, 0x16213e, 1);
    drawBarracks(this, 60, 1120, 250, 150, 0x101a30, 0xffe9a8, 0.25);
    drawBarracks(this, 430, 1120, 230, 130, 0x0d1628, 0xffe9a8, 0.2);
    drawFlagpole(this, 360, 1120, 170);
    const ground = this.add.graphics();
    ground.fillGradientStyle(0x1a2338, 0x1a2338, 0x11172a, 0x11172a, 1);
    ground.fillRect(0, 1120, GAME_WIDTH, GAME_HEIGHT - 1120);

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

    addMuteButton(this);
  }

  private toggleHelp(): void {
    if (this.helpPanel) {
      this.helpPanel.destroy();
      this.helpPanel = null;
      return;
    }
    const panel = this.add.container(0, 0).setDepth(3000);
    this.helpPanel = panel;

    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setOrigin(0)
      .setInteractive();
    panel.add(dim);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.panel, 0.97);
    bg.fillRoundedRect(40, 130, GAME_WIDTH - 80, 960, 24);
    panel.add(bg);

    panel.add(
      this.add
        .text(GAME_WIDTH / 2, 190, '📖 게임 설명', {
          fontFamily: FONT,
          fontSize: '40px',
          color: COLORS.textCss,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
    );

    const lines = [
      ['🎯 목표', '공사 2학년 생도 기태로 하루하루 버텨라.\n선배에게 걸리면 그날로 끝이다.'],
      ['📅 하루', '매일 퀘스트 1개 + 불시에 날아오는 미니 퀘스트(카톡).\n일차가 오를수록 모든 게 빨라진다.'],
      [
        '❤️ 목숨',
        '최대 3칸, 시작은 1칸. 죽으면 1칸 소모 —\n소모 후에도 온전한 하트가 남아야 그 날 아침으로 부활.\n미니 퀘스트 성공 +⅓ · 벽치기 도박 성공 +1',
      ],
      ['🫡 경례', '견장 줄 수로 판별: 1줄 후배·2줄 동기는 인사,\n3줄 선배에게는 경례. 문가 선배가 볼 땐 인사 금지!'],
      ['🏆 기록', '일차 높은 순 → 같은 일차면 오래 버틴 순.\n신기록은 자동으로 리더보드에 올라간다.'],
    ] as const;
    let y = 265;
    for (const [head, body] of lines) {
      panel.add(
        this.add.text(80, y, head, {
          fontFamily: FONT,
          fontSize: '30px',
          color: COLORS.warnCss,
          fontStyle: 'bold',
        })
      );
      panel.add(
        this.add.text(80, y + 42, body, {
          fontFamily: FONT,
          fontSize: '24px',
          color: COLORS.textCss,
          lineSpacing: 8,
          wordWrap: { width: GAME_WIDTH - 170 },
        })
      );
      y += 42 + (body.split('\n').length * 33 + 36);
    }

    const closeBtn = new Button(this, GAME_WIDTH / 2, 1020, {
      label: '닫기',
      width: 280,
      height: 88,
      onClick: () => {
        panel.destroy();
        this.helpPanel = null;
      },
    });
    panel.add(closeBtn);
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
