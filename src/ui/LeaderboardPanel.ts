import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { gameState } from '../core/GameState';
import { fetchTop } from '../core/Leaderboard';
import { Button } from './Button';

interface RowData {
  nickname: string;
  days: number;
  play_ms: number;
}

/**
 * 리더보드 패널 오버레이 (타이틀/결과 화면 공용).
 * 내 닉네임 행을 강조 표시하고, TOP 10 밖이면 하단에 내 등수를 따로 붙인다.
 * 정렬은 서버 기준: 일차 높은 순 → 같은 일차면 오래 버틴 순.
 */
export function showLeaderboardPanel(
  scene: Phaser.Scene,
  myNickname: string,
  onClose?: () => void
): Phaser.GameObjects.Container {
  const panel = scene.add.container(0, 0).setDepth(3000);

  const dim = scene.add
    .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
    .setOrigin(0)
    .setInteractive();
  panel.add(dim);

  const bg = scene.add.graphics();
  bg.fillStyle(COLORS.panel, 0.97);
  bg.fillRoundedRect(50, 160, GAME_WIDTH - 100, 900, 24);
  panel.add(bg);

  panel.add(
    scene.add
      .text(GAME_WIDTH / 2, 214, '🏆 리더보드 TOP 10', {
        fontFamily: FONT,
        fontSize: '40px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
  );
  panel.add(
    scene.add
      .text(GAME_WIDTH / 2, 258, '일차 높은 순 · 같은 일차면 오래 버틴 순', {
        fontFamily: FONT,
        fontSize: '22px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5)
  );

  const status = scene.add
    .text(GAME_WIDTH / 2, 560, '불러오는 중...', {
      fontFamily: FONT,
      fontSize: '30px',
      color: COLORS.subCss,
      align: 'center',
    })
    .setOrigin(0.5);
  panel.add(status);

  const closeBtn = new Button(scene, GAME_WIDTH / 2, 995, {
    label: '닫기',
    width: 280,
    height: 90,
    onClick: () => {
      panel.destroy();
      onClose?.();
    },
  });
  panel.add(closeBtn);

  const addRow = (y: number, rank: number, e: RowData, highlight: boolean): void => {
    if (highlight) {
      const hl = scene.add.graphics();
      hl.fillStyle(COLORS.safe, 0.16);
      hl.fillRoundedRect(80, y - 26, GAME_WIDTH - 160, 52, 10);
      panel.add(hl);
    }
    const rankColor =
      rank === 1 ? '#ffd700' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : COLORS.textCss;
    const nameColor = highlight ? COLORS.safeCss : rankColor;
    const seconds = Math.round(e.play_ms / 1000);
    panel.add(
      scene.add
        .text(110, y, `${rank}.`, {
          fontFamily: FONT,
          fontSize: '30px',
          color: nameColor,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5)
    );
    panel.add(
      scene.add
        .text(180, y, `${e.nickname}${highlight ? ' ◀ 나' : ''}`, {
          fontFamily: FONT,
          fontSize: '30px',
          color: nameColor,
          fontStyle: highlight ? 'bold' : 'normal',
        })
        .setOrigin(0, 0.5)
    );
    panel.add(
      scene.add
        .text(GAME_WIDTH - 110, y, `${e.days}일차 · ${seconds}초`, {
          fontFamily: FONT,
          fontSize: '28px',
          color: highlight ? COLORS.safeCss : COLORS.subCss,
        })
        .setOrigin(1, 0.5)
    );
  };

  void fetchTop(myNickname || undefined).then((result) => {
    if (!panel.active) return;
    if (!result) {
      status.setText(
        `오프라인이거나 서버에 연결할 수 없어요.\n\n내 최고 기록: ${gameState.bestDay}일차`
      );
      return;
    }
    status.destroy();
    const { entries, me } = result;
    if (entries.length === 0) {
      panel.add(
        scene.add
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
      const highlight = myNickname.length > 0 && e.nickname === myNickname;
      addRow(300 + i * 58, i + 1, e, highlight);
    });

    // TOP 10 밖의 내 기록은 하단에 따로 고정해 바로 확인
    if (me && myNickname && me.rank > 10) {
      panel.add(
        scene.add
          .text(GAME_WIDTH / 2, 886, '· · ·', {
            fontFamily: FONT,
            fontSize: '26px',
            color: COLORS.subCss,
          })
          .setOrigin(0.5)
      );
      addRow(922, me.rank, { nickname: myNickname, days: me.days, play_ms: me.play_ms }, true);
    } else if (!me && myNickname) {
      panel.add(
        scene.add
          .text(GAME_WIDTH / 2, 910, `'${myNickname}' 기록이 아직 서버에 없어요`, {
            fontFamily: FONT,
            fontSize: '24px',
            color: COLORS.subCss,
          })
          .setOrigin(0.5)
      );
    }
  });

  return panel;
}
