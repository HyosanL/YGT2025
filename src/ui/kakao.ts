import Phaser from 'phaser';
import { FONT, GAME_WIDTH } from '../config';

/**
 * 실제 카카오톡 채팅방을 최대한 그대로 옮긴 UI 조각들.
 * 세 미니 퀘스트(답장·투표·사진)가 전부 이 모듈을 공유한다.
 */
export const KAKAO = {
  /** 채팅방 배경 (카톡 기본 하늘색) */
  chat: 0xb2c7d9,
  /** 상단바/입력바 흰색 */
  chrome: 0xffffff,
  bubbleWhite: 0xffffff,
  /** 내 말풍선 노랑 */
  yellow: 0xfee500,
  hairline: 0xdfe4ea,
  textDark: '#1a1a1a',
  textBrown: '#3c1e1e',
  /** 보낸 사람 이름 */
  nameCss: '#4d4d4d',
  /** 시각·읽음표시 */
  metaCss: '#5f6b78',
  sub: '#6b7684',
  /** 읽지 않은 사람 수(노란 숫자) */
  unreadCss: '#f0c419',
} as const;

/** 채팅방 뼈대를 그린 뒤 알려주는, 메시지를 놓을 수 있는 영역 */
export interface KakaoRoom {
  /** 대화 영역 위/아래 경계 y */
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const STATUS_H = 30;
const NAV_H = 82;
export const KAKAO_INPUT_H = 96;

/**
 * 폰 화면처럼 보이는 채팅방 뼈대 — 상태바 + 네비게이션바 + 대화 배경 + 입력바.
 * 반환값의 top/bottom 사이에 말풍선을 쌓으면 된다.
 */
export function drawKakaoRoom(
  scene: Phaser.Scene,
  rect: { x: number; y: number; w: number; h: number },
  opts: { title: string; memberCount?: number; placeholder?: string }
): KakaoRoom {
  const { x, y, w, h } = rect;
  const r = 26;
  const g = scene.add.graphics();

  // 폰 베젤 — 아래에 깔린 게임 화면과 분리해 '스크린샷' 느낌을 준다
  g.fillStyle(0x11151c, 0.55);
  g.fillRoundedRect(x - 7, y - 7, w + 14, h + 16, r + 7);

  // 대화 배경
  g.fillStyle(KAKAO.chat, 1);
  g.fillRoundedRect(x, y, w, h, r);

  // 상태바 + 네비게이션바 (한 덩어리 흰색)
  g.fillStyle(KAKAO.chrome, 1);
  g.fillRoundedRect(x, y, w, STATUS_H + NAV_H, { tl: r, tr: r, bl: 0, br: 0 });
  g.lineStyle(2, KAKAO.hairline, 1);
  g.lineBetween(x, y + STATUS_H + NAV_H, x + w, y + STATUS_H + NAV_H);

  // ── 상태바: 시각 / 신호·와이파이·배터리 ──
  scene.add
    .text(x + 26, y + STATUS_H / 2 + 1, '9:47', {
      fontFamily: FONT,
      fontSize: '19px',
      color: '#111111',
      fontStyle: 'bold',
    })
    .setOrigin(0, 0.5);
  const sig = scene.add.graphics();
  sig.fillStyle(0x111111, 1);
  for (let i = 0; i < 4; i++) sig.fillRoundedRect(x + w - 96 + i * 8, y + 16 - i * 3, 5, 6 + i * 3, 1);
  // 와이파이 (부채꼴 3겹)
  const wx = x + w - 54, wy = y + STATUS_H / 2 + 5;
  for (const [rad, a] of [[12, 1], [8, 1], [3.5, 1]] as const) {
    sig.lineStyle(2.5, 0x111111, a);
    sig.beginPath();
    sig.arc(wx, wy, rad, Phaser.Math.DegToRad(215), Phaser.Math.DegToRad(325));
    sig.strokePath();
  }
  // 배터리
  sig.lineStyle(2, 0x111111, 0.85);
  sig.strokeRoundedRect(x + w - 34, y + 8, 22, 12, 3);
  sig.fillStyle(0x111111, 1);
  sig.fillRoundedRect(x + w - 32, y + 10, 15, 8, 2);
  sig.fillRoundedRect(x + w - 11, y + 11, 2, 6, 1);

  // ── 네비게이션바: ‹ 뒤로 · 방 제목(+인원) · 검색 · 메뉴 ──
  const navY = y + STATUS_H + NAV_H / 2;
  const back = scene.add.graphics();
  back.lineStyle(5, 0x1a1a1a, 1);
  back.beginPath();
  back.moveTo(x + 40, navY - 13);
  back.lineTo(x + 27, navY);
  back.lineTo(x + 40, navY + 13);
  back.strokePath();

  const title = scene.add
    .text(x + 60, navY, opts.title, {
      fontFamily: FONT,
      fontSize: '31px',
      color: '#0d0d0d',
      fontStyle: 'bold',
    })
    .setOrigin(0, 0.5);
  if (opts.memberCount) {
    scene.add
      .text(x + 68 + title.width, navY + 2, `${opts.memberCount}`, {
        fontFamily: FONT,
        fontSize: '25px',
        color: '#9aa2ac',
      })
      .setOrigin(0, 0.5);
  }

  // 돋보기
  const icon = scene.add.graphics();
  icon.lineStyle(4, 0x1a1a1a, 1);
  icon.strokeCircle(x + w - 86, navY - 3, 12);
  icon.lineBetween(x + w - 78, navY + 6, x + w - 71, navY + 13);
  // 햄버거
  for (let i = 0; i < 3; i++) icon.lineBetween(x + w - 48, navY - 10 + i * 10, x + w - 24, navY - 10 + i * 10);

  // ── 입력바 ──
  const inputTop = y + h - KAKAO_INPUT_H;
  g.fillStyle(KAKAO.chrome, 1);
  g.fillRoundedRect(x, inputTop, w, KAKAO_INPUT_H, { tl: 0, tr: 0, bl: r, br: r });
  g.lineStyle(2, KAKAO.hairline, 1);
  g.lineBetween(x, inputTop, x + w, inputTop);

  const midY = inputTop + KAKAO_INPUT_H / 2;
  const plus = scene.add.graphics();
  plus.lineStyle(4, 0x8b95a1, 1);
  plus.lineBetween(x + 26, midY, x + 54, midY);
  plus.lineBetween(x + 40, midY - 14, x + 40, midY + 14);
  if (opts.placeholder) {
    scene.add
      .text(x + 76, midY, opts.placeholder, {
        fontFamily: FONT,
        fontSize: '25px',
        color: '#b0b8c1',
      })
      .setOrigin(0, 0.5);
  }
  // 이모티콘(웃는 얼굴) + 샵 검색
  const right = scene.add.graphics();
  right.lineStyle(3.5, 0x8b95a1, 1);
  right.strokeCircle(x + w - 46, midY, 15);
  right.fillStyle(0x8b95a1, 1);
  right.fillCircle(x + w - 51, midY - 5, 2.4);
  right.fillCircle(x + w - 41, midY - 5, 2.4);
  right.beginPath();
  right.arc(x + w - 46, midY + 1, 8, Phaser.Math.DegToRad(25), Phaser.Math.DegToRad(155));
  right.strokePath();

  return { top: y + STATUS_H + NAV_H, bottom: inputTop, left: x, right: x + w };
}

/** 가운데 회색 알약형 날짜 구분선 */
export function drawKakaoDate(scene: Phaser.Scene, y: number, text: string): void {
  const label = scene.add
    .text(GAME_WIDTH / 2, y, text, { fontFamily: FONT, fontSize: '21px', color: '#ffffff' })
    .setOrigin(0.5)
    .setDepth(2);
  const g = scene.add.graphics().setDepth(1);
  g.fillStyle(0x000000, 0.17);
  g.fillRoundedRect(GAME_WIDTH / 2 - label.width / 2 - 20, y - 18, label.width + 40, 36, 18);
}

export interface BubbleOptions {
  /** 말풍선 왼쪽(상대) 시작 x 또는 오른쪽(나) 끝 x */
  x: number;
  /** 말풍선 위쪽 y */
  y: number;
  text: string;
  /** 최대 폭 */
  maxWidth: number;
  fontSize?: number;
  time?: string;
  bold?: boolean;
}

/** 상대 메시지 — 프로필 + 이름 + 흰 말풍선(꼬리) + 시각 */
export function drawIncoming(
  scene: Phaser.Scene,
  opts: BubbleOptions & { name: string; avatarKey?: string; avatarEmoji?: string }
): number {
  const { x, y, text, maxWidth } = opts;
  const size = opts.fontSize ?? 26;
  const avatarSize = 66;

  // 프로필 사진 — 카톡의 둥근 사각형 썸네일
  const av = scene.add.graphics();
  av.fillStyle(0xc9d3dd, 1);
  av.fillRoundedRect(x, y, avatarSize, avatarSize, 22);
  if (opts.avatarKey && scene.textures.exists(opts.avatarKey)) {
    const img = scene.add.image(x + avatarSize / 2, y + avatarSize / 2 + 4, opts.avatarKey);
    img.setDisplaySize(avatarSize * 1.05, avatarSize * 1.05 * (img.height / img.width));
    const mask = scene.make.graphics({}, false);
    mask.fillStyle(0xffffff);
    mask.fillRoundedRect(x, y, avatarSize, avatarSize, 22);
    img.setMask(mask.createGeometryMask());
  } else if (opts.avatarEmoji) {
    scene.add
      .text(x + avatarSize / 2, y + avatarSize / 2, opts.avatarEmoji, {
        fontFamily: FONT,
        fontSize: '34px',
      })
      .setOrigin(0.5);
  }

  const bubbleX = x + avatarSize + 18;
  scene.add
    .text(bubbleX, y + 2, opts.name, { fontFamily: FONT, fontSize: '22px', color: KAKAO.nameCss })
    .setOrigin(0, 0);

  const body = scene.add
    .text(bubbleX + 22, y + 44, text, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color: KAKAO.textDark,
      fontStyle: opts.bold ? 'bold' : 'normal',
      lineSpacing: 8,
      wordWrap: { width: maxWidth - 44 },
    })
    .setOrigin(0, 0)
    .setDepth(2);

  const bw = body.width + 44;
  const bh = body.height + 34;
  const g = scene.add.graphics().setDepth(1);
  g.fillStyle(KAKAO.bubbleWhite, 1);
  g.fillRoundedRect(bubbleX, y + 27, bw, bh, 14);
  // 왼쪽 위 꼬리
  g.fillTriangle(bubbleX, y + 33, bubbleX - 11, y + 39, bubbleX, y + 51);
  body.setY(y + 27 + 17);

  if (opts.time) {
    scene.add
      .text(bubbleX + bw + 10, y + 27 + bh - 6, opts.time, {
        fontFamily: FONT,
        fontSize: '18px',
        color: KAKAO.metaCss,
      })
      .setOrigin(0, 1);
  }
  return Math.max(avatarSize, 27 + bh) + 22;
}

/** 내 메시지 — 오른쪽 노란 말풍선 + 안 읽은 수 + 시각 */
export function drawOutgoing(
  scene: Phaser.Scene,
  opts: BubbleOptions & { unread?: number }
): number {
  const { x, y, text, maxWidth } = opts;
  const size = opts.fontSize ?? 26;
  const body = scene.add
    .text(0, 0, text, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color: KAKAO.textBrown,
      lineSpacing: 8,
      wordWrap: { width: maxWidth - 44 },
    })
    .setOrigin(0, 0)
    .setDepth(2);
  const bw = body.width + 44;
  const bh = body.height + 34;
  const left = x - bw;

  const g = scene.add.graphics().setDepth(1);
  g.fillStyle(KAKAO.yellow, 1);
  g.fillRoundedRect(left, y, bw, bh, 14);
  g.fillTriangle(x, y + 6, x + 11, y + 12, x, y + 24);
  body.setPosition(left + 22, y + 17);

  const meta = scene.add
    .text(left - 10, y + bh - 6, opts.time ?? '', {
      fontFamily: FONT,
      fontSize: '18px',
      color: KAKAO.metaCss,
    })
    .setOrigin(1, 1);
  if (opts.unread) {
    scene.add
      .text(meta.x - meta.width - 8, y + bh - 6, `${opts.unread}`, {
        fontFamily: FONT,
        fontSize: '18px',
        color: KAKAO.unreadCss,
        fontStyle: 'bold',
      })
      .setOrigin(1, 1);
  }
  return bh + 22;
}
