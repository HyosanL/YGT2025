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

/** 폰 상태바 — 시각·알림끔 / 신호·5G·배터리 (채팅방과 상세보기가 공유) */
function drawStatusBar(scene: Phaser.Scene, x: number, y: number, w: number): void {
  scene.add
    .text(x + 26, y + STATUS_H / 2 + 1, '17:30', {
      fontFamily: FONT,
      fontSize: '19px',
      color: '#111111',
      fontStyle: 'bold',
    })
    .setOrigin(0, 0.5);
  const sig = scene.add.graphics();
  // 신호 막대 4개
  sig.fillStyle(0x111111, 1);
  for (let i = 0; i < 4; i++) sig.fillRoundedRect(x + w - 118 + i * 8, y + 16 - i * 3, 5, 6 + i * 3, 1);
  // 5G
  scene.add
    .text(x + w - 78, y + STATUS_H / 2 + 1, '5G', {
      fontFamily: FONT,
      fontSize: '17px',
      color: '#111111',
      fontStyle: 'bold',
    })
    .setOrigin(0, 0.5);
  // 배터리 (잔량 숫자가 안에 찍힌 검은 알약)
  sig.fillStyle(0x111111, 1);
  sig.fillRoundedRect(x + w - 42, y + 7, 28, 15, 5);
  sig.fillRoundedRect(x + w - 12, y + 11, 2, 7, 1);
  scene.add
    .text(x + w - 28, y + 14, '26', { fontFamily: FONT, fontSize: '12px', color: '#ffffff' })
    .setOrigin(0.5);
}

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

  drawStatusBar(scene, x, y, w);

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

/**
 * 카톡 '상세보기' 페이지 뼈대 — 투표를 열면 나오는 흰 전체화면.
 * 채팅방(하늘색)이 아니라 **흰 배경 + 가운데 정렬 제목 + 뒤로가기**가 특징이다.
 * 반환값의 top부터 아래로 작성자 행 → 안내 알약 → 투표 카드를 쌓는다.
 */
export function drawKakaoDetailPage(
  scene: Phaser.Scene,
  rect: { x: number; y: number; w: number; h: number },
  opts: { title: string }
): KakaoRoom {
  const { x, y, w, h } = rect;
  const r = 26;
  const g = scene.add.graphics();

  g.fillStyle(0x11151c, 0.55);
  g.fillRoundedRect(x - 7, y - 7, w + 14, h + 16, r + 7);
  g.fillStyle(KAKAO.chrome, 1);
  g.fillRoundedRect(x, y, w, h, r);

  drawStatusBar(scene, x, y, w);

  // 네비게이션 — ‹ 뒤로 + 가운데 정렬 제목 (채팅방과 달리 제목이 정중앙이다)
  const navY = y + STATUS_H + NAV_H / 2;
  const back = scene.add.graphics();
  back.lineStyle(5, 0x1a1a1a, 1);
  back.beginPath();
  back.moveTo(x + 44, navY - 13);
  back.lineTo(x + 30, navY);
  back.lineTo(x + 44, navY + 13);
  back.strokePath();
  scene.add
    .text(x + w / 2, navY, opts.title, {
      fontFamily: FONT,
      fontSize: '30px',
      color: '#0d0d0d',
      fontStyle: 'bold',
    })
    .setOrigin(0.5);

  // 하단 댓글 바
  const barTop = y + h - KAKAO_INPUT_H;
  g.lineStyle(2, KAKAO.hairline, 1);
  g.lineBetween(x + 22, barTop, x + w - 22, barTop);
  const midY = barTop + KAKAO_INPUT_H / 2;
  const heart = scene.add.graphics();
  heart.lineStyle(3.5, 0x8b95a1, 1);
  heart.beginPath();
  heart.arc(x + 40, midY - 4, 8, Phaser.Math.DegToRad(160), Phaser.Math.DegToRad(340));
  heart.arc(x + 55, midY - 4, 8, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(20));
  heart.lineTo(x + 47, midY + 14);
  heart.closePath();
  heart.strokePath();
  scene.add
    .text(x + 82, midY, '댓글을 남겨보세요.', {
      fontFamily: FONT,
      fontSize: '24px',
      color: '#b0b8c1',
    })
    .setOrigin(0, 0.5);
  const smile = scene.add.graphics();
  smile.lineStyle(3.5, 0x8b95a1, 1);
  smile.strokeCircle(x + w - 116, midY, 15);
  smile.fillStyle(0x8b95a1, 1);
  smile.fillCircle(x + w - 121, midY - 5, 2.4);
  smile.fillCircle(x + w - 111, midY - 5, 2.4);
  const submit = scene.add.graphics();
  submit.fillStyle(0xf1f3f5, 1);
  submit.fillRoundedRect(x + w - 92, midY - 22, 70, 44, 8);
  scene.add
    .text(x + w - 57, midY, '등록', { fontFamily: FONT, fontSize: '24px', color: '#4d4d4d' })
    .setOrigin(0.5);

  // top을 네비 바로 아래가 아니라 한 칸 더 내려 잡는다 — 그 사이에 미니퀘스트
  // 제한시간 바가 그려지므로, 붙여 두면 작성자 이름 위로 바가 겹친다.
  return { top: y + STATUS_H + NAV_H + 56, bottom: barTop, left: x, right: x + w };
}

/** 상세보기 상단의 작성자 행 — 원형 프로필 + 이름 + '지금' + ⋯ */
export function drawKakaoAuthor(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  opts: { name: string; avatarKey?: string; avatarEmoji?: string }
): number {
  const size = 56;
  const cx = x + 24 + size / 2;
  const cy = y + 12 + size / 2;
  const av = scene.add.graphics();
  av.fillStyle(0xc9d3dd, 1);
  av.fillCircle(cx, cy, size / 2);
  if (opts.avatarKey && scene.textures.exists(opts.avatarKey)) {
    const img = scene.add.image(cx, cy + 3, opts.avatarKey);
    img.setDisplaySize(size * 1.08, size * 1.08 * (img.height / img.width));
    const mask = scene.make.graphics({}, false);
    mask.fillStyle(0xffffff);
    mask.fillCircle(cx, cy, size / 2);
    img.setMask(mask.createGeometryMask());
  } else if (opts.avatarEmoji) {
    scene.add
      .text(cx, cy, opts.avatarEmoji, { fontFamily: FONT, fontSize: '30px' })
      .setOrigin(0.5);
  }
  scene.add
    .text(cx + size / 2 + 16, cy - 12, opts.name, {
      fontFamily: FONT,
      fontSize: '25px',
      color: '#0d0d0d',
      fontStyle: 'bold',
    })
    .setOrigin(0, 0.5);
  scene.add
    .text(cx + size / 2 + 16, cy + 14, '지금', {
      fontFamily: FONT,
      fontSize: '21px',
      color: '#9aa2ac',
    })
    .setOrigin(0, 0.5);
  const dots = scene.add.graphics();
  dots.fillStyle(0x8b95a1, 1);
  for (let i = 0; i < 3; i++) dots.fillCircle(x + w - 62 + i * 14, cy, 3.2);
  return size + 26;
}

/** '투표가 1일 후에 종료됩니다' 회색 안내 띠 */
export function drawKakaoNotice(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  text: string
): number {
  const h = 52;
  const g = scene.add.graphics();
  g.fillStyle(0xf6f7f9, 1);
  g.fillRoundedRect(x + 20, y, w - 40, h, 8);
  const clock = scene.add.graphics();
  clock.lineStyle(2.5, 0x8b95a1, 1);
  clock.strokeCircle(x + 46, y + h / 2, 10);
  clock.lineBetween(x + 46, y + h / 2 - 5, x + 46, y + h / 2);
  clock.lineBetween(x + 46, y + h / 2, x + 51, y + h / 2 + 3);
  scene.add
    .text(x + 66, y + h / 2, text, { fontFamily: FONT, fontSize: '22px', color: '#6b7684' })
    .setOrigin(0, 0.5);
  return h + 14;
}

export interface VoteOptionHandle {
  /** 선택 상태를 그린다 (노란 동그라미 + 검은 체크) */
  setSelected: (on: boolean) => void;
  /** 정답/오답 공개용 테두리 */
  mark: (color: number) => void;
  hitArea: Phaser.Geom.Rectangle;
}

/**
 * 카톡 투표 카드 — 흰 카드에 굵은 질문, 그 아래 원형 라디오 + 선지, 맨 아래 [투표하기].
 * 실제 앱과 같게 **선지를 골라 선택한 뒤 [투표하기]를 눌러야** 제출된다.
 */
export function drawKakaoVoteCard(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  opts: { question: string; options: string[]; onSelect: (i: number) => void; onSubmit: () => void }
): { height: number; handles: VoteOptionHandle[]; setSubmitEnabled: (on: boolean) => void } {
  const padX = 26;
  const title = scene.add
    .text(x + padX, y + 30, opts.question, {
      fontFamily: FONT,
      fontSize: '26px',
      color: '#0d0d0d',
      fontStyle: 'bold',
      lineSpacing: 8,
      wordWrap: { width: w - padX * 2 },
    })
    .setOrigin(0, 0)
    .setDepth(2);

  const handles: VoteOptionHandle[] = [];
  let rowY = y + 30 + title.height + 26;
  const rowGap = 22;

  const card = scene.add.graphics().setDepth(1);
  const marks = scene.add.graphics().setDepth(2);

  opts.options.forEach((option, i) => {
    const label = scene.add
      .text(x + padX + 52, rowY, option, {
        fontFamily: FONT,
        fontSize: '23px',
        color: '#1a1a1a',
        lineSpacing: 6,
        wordWrap: { width: w - padX * 2 - 60 },
      })
      .setOrigin(0, 0)
      .setDepth(3);
    const rowH = Math.max(label.height, 34);
    const cy = rowY + rowH / 2;
    label.setY(cy - label.height / 2);

    const radio = scene.add.graphics().setDepth(3);
    const drawRadio = (on: boolean): void => {
      radio.clear();
      if (on) {
        radio.fillStyle(KAKAO.yellow, 1);
        radio.fillCircle(x + padX + 18, cy, 17);
        radio.lineStyle(4, 0x1a1a1a, 1);
        radio.beginPath();
        radio.moveTo(x + padX + 10, cy);
        radio.lineTo(x + padX + 16, cy + 7);
        radio.lineTo(x + padX + 27, cy - 7);
        radio.strokePath();
      } else {
        radio.lineStyle(2.5, 0xc8ced5, 1);
        radio.strokeCircle(x + padX + 18, cy, 17);
      }
    };
    drawRadio(false);

    const hit = new Phaser.Geom.Rectangle(x + padX - 6, rowY - 8, w - padX * 2 + 12, rowH + 16);
    const zone = scene.add
      .zone(hit.centerX, hit.centerY, hit.width, hit.height)
      .setOrigin(0.5)
      .setInteractive();
    zone.on('pointerdown', () => opts.onSelect(i));

    handles.push({
      setSelected: drawRadio,
      mark: (color: number) => {
        marks.lineStyle(3, color, 1);
        marks.strokeRoundedRect(hit.x, hit.y, hit.width, hit.height, 10);
      },
      hitArea: hit,
    });
    rowY += rowH + rowGap;
  });

  // [투표하기]
  const btnY = rowY + 12;
  const btnH = 62;
  const btn = scene.add.graphics().setDepth(2);
  const btnLabel = scene.add
    .text(x + w / 2, btnY + btnH / 2, '투표하기', {
      fontFamily: FONT,
      fontSize: '25px',
      color: '#8b95a1',
    })
    .setOrigin(0.5)
    .setDepth(3);
  const paint = (on: boolean): void => {
    btn.clear();
    btn.fillStyle(on ? KAKAO.yellow : 0xf1f3f5, 1);
    btn.fillRoundedRect(x + padX - 8, btnY, w - (padX - 8) * 2, btnH, 10);
    btnLabel.setColor(on ? '#1a1a1a' : '#8b95a1');
  };
  paint(false);
  scene.add
    .zone(x + w / 2, btnY + btnH / 2, w - padX * 2, btnH)
    .setOrigin(0.5)
    .setInteractive()
    .on('pointerdown', () => opts.onSubmit());

  const height = btnY + btnH + 30 - y;
  card.fillStyle(0xffffff, 1);
  card.fillRoundedRect(x, y, w, height, 14);
  card.lineStyle(2, 0xe6e9ed, 1);
  card.strokeRoundedRect(x, y, w, height, 14);

  return { height, handles, setSubmitEnabled: paint };
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
