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

/** 스크롤 뷰포트 (마스크 영역) */
const VIEW_TOP = 300;
const VIEW_BOTTOM = 858;
const VIEW_H = VIEW_BOTTOM - VIEW_TOP;
const ROW_H = 58;
const ROW_PAD_TOP = 30;

/**
 * 리더보드 패널 오버레이 (타이틀/결과 화면 공용).
 * 서버 상위 50개를 **스크롤(드래그/휠)** 로 훑어볼 수 있고, 내 닉네임 행을 강조한다.
 * 하단에 고정된 '내 등수' 막대를 누르면 목록에서 내 위치로 스르륵 이동한다.
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
  bg.fillStyle(COLORS.panelDark, 0.98);
  bg.fillRoundedRect(50, 160, GAME_WIDTH - 100, 900, 24);
  panel.add(bg);

  panel.add(
    scene.add
      .text(GAME_WIDTH / 2, 214, '🏆 리더보드', {
        fontFamily: FONT,
        fontSize: '40px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
  );
  panel.add(
    scene.add
      .text(GAME_WIDTH / 2, 258, '일차 높은 순 · 같은 일차면 오래 버틴 순 · 위아래로 넘겨보기', {
        fontFamily: FONT,
        fontSize: '21px',
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

  // ── 스크롤 목록 (마스크된 뷰포트 안의 컨테이너) ──
  const list = scene.add.container(0, VIEW_TOP);
  panel.add(list);
  const maskG = scene.make.graphics({}, false);
  maskG.fillStyle(0xffffff);
  maskG.fillRect(58, VIEW_TOP, GAME_WIDTH - 116, VIEW_H);
  list.setMask(maskG.createGeometryMask());

  // 스크롤바 (오른쪽 얇은 트랙 + 썸)
  const scrollbar = scene.add.graphics().setDepth(1);
  panel.add(scrollbar);

  let scroll = 0;
  let maxScroll = 0;
  let contentH = 0;
  const applyScroll = (): void => {
    scroll = Phaser.Math.Clamp(scroll, -maxScroll, 0);
    list.y = VIEW_TOP + scroll;
    scrollbar.clear();
    if (maxScroll <= 0) return;
    const trackX = GAME_WIDTH - 74;
    scrollbar.fillStyle(0xffffff, 0.08);
    scrollbar.fillRoundedRect(trackX, VIEW_TOP, 6, VIEW_H, 3);
    const thumbH = Math.max(40, (VIEW_H * VIEW_H) / contentH);
    const t = -scroll / maxScroll; // 0(top)~1(bottom)
    const thumbY = VIEW_TOP + t * (VIEW_H - thumbH);
    scrollbar.fillStyle(0x8892a6, 0.6);
    scrollbar.fillRoundedRect(trackX, thumbY, 6, thumbH, 3);
  };

  // 드래그(뷰포트 위) + 마우스 휠 스크롤
  const zone = scene.add
    .zone(GAME_WIDTH / 2, VIEW_TOP + VIEW_H / 2, GAME_WIDTH - 100, VIEW_H)
    .setOrigin(0.5)
    .setInteractive();
  panel.add(zone);
  let dragging = false;
  let dragStartY = 0;
  let dragStartScroll = 0;
  zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
    dragging = true;
    dragStartY = p.y;
    dragStartScroll = scroll;
  });
  const onMove = (p: Phaser.Input.Pointer): void => {
    if (!dragging) return;
    scroll = dragStartScroll + (p.y - dragStartY);
    applyScroll();
  };
  const onUp = (): void => {
    dragging = false;
  };
  const onWheel = (_p: unknown, _go: unknown, _dx: number, dy: number): void => {
    if (!panel.active) return;
    scroll -= dy * 0.6;
    applyScroll();
  };
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);
  scene.input.on('wheel', onWheel);
  panel.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
    scene.input.off('wheel', onWheel);
    maskG.destroy();
  });

  /** 목록 컨테이너 로컬 y(중심)에 한 행을 그린다 */
  const addRow = (localY: number, rank: number, e: RowData, highlight: boolean): void => {
    if (highlight) {
      const hl = scene.add.graphics();
      hl.fillStyle(COLORS.safe, 0.16);
      hl.fillRoundedRect(78, localY - 26, GAME_WIDTH - 156, 52, 10);
      list.add(hl);
    }
    const rankColor =
      rank === 1 ? '#ffd700' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : COLORS.textCss;
    const nameColor = highlight ? COLORS.safeCss : rankColor;
    const seconds = Math.round(e.play_ms / 1000);
    list.add(
      scene.add
        .text(110, localY, `${rank}.`, {
          fontFamily: FONT,
          fontSize: '30px',
          color: nameColor,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5)
    );
    list.add(
      scene.add
        .text(184, localY, `${e.nickname}${highlight ? ' ◀ 나' : ''}`, {
          fontFamily: FONT,
          fontSize: '30px',
          color: nameColor,
          fontStyle: highlight ? 'bold' : 'normal',
        })
        .setOrigin(0, 0.5)
    );
    list.add(
      scene.add
        .text(GAME_WIDTH - 92, localY, `${e.days}일차 · ${seconds}초`, {
          fontFamily: FONT,
          fontSize: '28px',
          color: highlight ? COLORS.safeCss : COLORS.subCss,
        })
        .setOrigin(1, 0.5)
    );
  };

  /** 목록에서 내 행이 뷰포트 중앙에 오도록 부드럽게 스크롤 */
  const scrollToMyRow = (myLocalY: number): void => {
    const target = Phaser.Math.Clamp(VIEW_H / 2 - myLocalY, -maxScroll, 0);
    const holder = { s: scroll };
    scene.tweens.add({
      targets: holder,
      s: target,
      duration: 380,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        scroll = holder.s;
        applyScroll();
      },
    });
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

    let myLocalY = -1;
    let localY = ROW_PAD_TOP;
    entries.forEach((e, i) => {
      const highlight = myNickname.length > 0 && e.nickname === myNickname;
      if (highlight) myLocalY = localY;
      addRow(localY, i + 1, e, highlight);
      localY += ROW_H;
    });

    // 조회된 목록(상위 50) 밖의 내 기록은 '···' 뒤에 이어 붙인다
    if (me && myNickname && myLocalY < 0) {
      list.add(
        scene.add
          .text(GAME_WIDTH / 2, localY + 8, '· · ·', {
            fontFamily: FONT,
            fontSize: '26px',
            color: COLORS.subCss,
          })
          .setOrigin(0.5)
      );
      localY += 44;
      myLocalY = localY;
      addRow(localY, me.rank, { nickname: myNickname, days: me.days, play_ms: me.play_ms }, true);
      localY += ROW_H;
    }

    contentH = localY + 10;
    maxScroll = Math.max(0, contentH - VIEW_H);
    applyScroll();

    // ── 하단 고정 '내 등수' 막대 — 누르면 내 위치로 이동 ──
    if (me && myNickname && myLocalY >= 0) {
      const barY = 902;
      const barBg = scene.add.graphics();
      const paint = (down: boolean): void => {
        barBg.clear();
        barBg.fillStyle(COLORS.safe, down ? 0.32 : 0.2);
        barBg.fillRoundedRect(72, barY - 30, GAME_WIDTH - 144, 60, 12);
        barBg.lineStyle(2.5, COLORS.safe, 0.75);
        barBg.strokeRoundedRect(72, barY - 30, GAME_WIDTH - 144, 60, 12);
      };
      paint(false);
      panel.add(barBg);
      const secs = Math.round(me.play_ms / 1000);
      panel.add(
        scene.add
          .text(96, barY, `내 등수  ${me.rank}위 · ${me.days}일차 · ${secs}초`, {
            fontFamily: FONT,
            fontSize: '27px',
            color: COLORS.safeCss,
            fontStyle: 'bold',
          })
          .setOrigin(0, 0.5)
      );
      panel.add(
        scene.add
          .text(GAME_WIDTH - 96, barY, '내 위치로 ↕', {
            fontFamily: FONT,
            fontSize: '25px',
            color: COLORS.safeCss,
          })
          .setOrigin(1, 0.5)
      );
      const barZone = scene.add
        .zone(GAME_WIDTH / 2, barY, GAME_WIDTH - 144, 60)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      panel.add(barZone);
      barZone.on('pointerdown', () => paint(true));
      barZone.on('pointerup', () => {
        paint(false);
        scrollToMyRow(myLocalY);
      });
      barZone.on('pointerout', () => paint(false));
    }
  });

  return panel;
}
