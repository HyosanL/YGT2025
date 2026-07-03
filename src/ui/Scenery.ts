import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';

/**
 * 애니풍 배경 공용 헬퍼 — 생도 생활구역(생활관/샤워장/세탁실/연병장) 소품 모음.
 * 전부 벡터 드로잉이라 텍스처 로딩이 필요 없고, 생성 순서대로 뒤에 깔린다.
 */

// ── 하늘 / 원경 ────────────────────────────────

/** 세로 그라데이션 하늘(또는 벽면) */
export function drawSkyGradient(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  top: number,
  bottom: number
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillGradientStyle(top, top, bottom, bottom, 1);
  g.fillRect(x, y, w, h);
  return g;
}

/** 뭉게구름 — 느리게 좌우로 떠다닌다 */
export function drawCloud(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale = 1,
  alpha = 0.9
): void {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, alpha);
  g.fillEllipse(0, 0, 150 * scale, 56 * scale);
  g.fillEllipse(-55 * scale, 12 * scale, 90 * scale, 40 * scale);
  g.fillEllipse(58 * scale, 10 * scale, 100 * scale, 44 * scale);
  g.fillEllipse(10 * scale, -20 * scale, 90 * scale, 46 * scale);
  g.fillStyle(0xd9e6f2, alpha * 0.8);
  g.fillEllipse(0, 20 * scale, 130 * scale, 24 * scale);
  c.add(g);
  scene.tweens.add({
    targets: c,
    x: x + 26 + Math.random() * 20,
    duration: 6000 + Math.random() * 4000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}

/** 원경 산맥 한 겹 (지그재그 능선) */
export function drawMountains(
  scene: Phaser.Scene,
  baseY: number,
  height: number,
  color: number,
  alpha = 1
): void {
  const g = scene.add.graphics();
  g.fillStyle(color, alpha);
  const pts: Phaser.Types.Math.Vector2Like[] = [{ x: -40, y: baseY }];
  const peaks = 5;
  const stepW = (GAME_WIDTH + 80) / peaks;
  for (let i = 0; i < peaks; i++) {
    const px = -40 + stepW * (i + 0.5);
    const ph = height * (0.6 + 0.4 * Math.abs(Math.sin(i * 2.7 + 1)));
    pts.push({ x: px, y: baseY - ph });
    pts.push({ x: -40 + stepW * (i + 1), y: baseY - height * 0.18 });
  }
  pts.push({ x: GAME_WIDTH + 40, y: baseY });
  g.fillPoints(pts, true);
}

/** 생활관 건물 실루엣 — 창문 몇 개에 불이 켜져 있다 */
export function drawBarracks(
  scene: Phaser.Scene,
  x: number,
  baseY: number,
  w: number,
  h: number,
  body: number,
  windowLit = 0xffe9a8,
  litChance = 0.4
): void {
  const g = scene.add.graphics();
  g.fillStyle(body, 1);
  g.fillRect(x, baseY - h, w, h);
  // 옥상 난간
  g.fillRect(x - 4, baseY - h - 8, w + 8, 8);
  // 창문 그리드
  const cols = Math.max(2, Math.floor(w / 46));
  const rows = Math.max(2, Math.floor(h / 44));
  const cw = w / cols;
  const rh = h / rows;
  for (let cx = 0; cx < cols; cx++) {
    for (let ry = 0; ry < rows; ry++) {
      const lit = Math.random() < litChance;
      g.fillStyle(lit ? windowLit : 0x2a3450, lit ? 0.95 : 0.8);
      g.fillRect(x + cx * cw + cw * 0.22, baseY - h + ry * rh + rh * 0.2, cw * 0.56, rh * 0.5);
    }
  }
}

/** 애니풍 나무 — 줄기 + 뭉게 수관 */
export function drawTree(
  scene: Phaser.Scene,
  x: number,
  baseY: number,
  scale = 1,
  canopy = 0x3f7d4e
): void {
  const g = scene.add.graphics();
  const dark = Phaser.Display.Color.IntegerToColor(canopy).darken(20).color;
  g.fillStyle(0x5a4632, 1);
  g.fillRect(x - 7 * scale, baseY - 60 * scale, 14 * scale, 60 * scale);
  g.fillStyle(dark, 1);
  g.fillCircle(x, baseY - 78 * scale, 42 * scale);
  g.fillCircle(x - 30 * scale, baseY - 60 * scale, 30 * scale);
  g.fillCircle(x + 30 * scale, baseY - 60 * scale, 30 * scale);
  g.fillStyle(canopy, 1);
  g.fillCircle(x - 12 * scale, baseY - 88 * scale, 32 * scale);
  g.fillCircle(x + 18 * scale, baseY - 76 * scale, 28 * scale);
  // 하이라이트
  g.fillStyle(0xffffff, 0.14);
  g.fillCircle(x - 20 * scale, baseY - 98 * scale, 14 * scale);
}

/** 국기 게양대 */
export function drawFlagpole(scene: Phaser.Scene, x: number, baseY: number, h: number): void {
  const g = scene.add.graphics();
  g.fillStyle(0xc8ccd8, 1);
  g.fillRect(x - 3, baseY - h, 6, h);
  g.fillStyle(0x9aa0b0, 1);
  g.fillRect(x - 14, baseY - 8, 28, 8);
  // 깃발은 깃대 부착점 기준으로 펄럭이도록 컨테이너 로컬로 그린다
  const flag = scene.add.container(x + 3, baseY - h + 4);
  const fg = scene.add.graphics();
  fg.fillStyle(0xf5f5f5, 1);
  fg.fillRect(0, 0, 52, 34);
  fg.fillStyle(0xe94560, 1);
  fg.fillCircle(26, 17, 9);
  flag.add(fg);
  scene.tweens.add({
    targets: flag,
    scaleX: { from: 1, to: 0.88 },
    duration: 900,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}

// ── 실내 소품 ────────────────────────────────

/** 창문 — 바깥 풍경(하늘 그라데이션 + 나무) + 창틀 */
export function drawWindowView(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { skyTop?: number; skyBottom?: number; night?: boolean; tree?: boolean } = {}
): void {
  const skyTop = opts.skyTop ?? (opts.night ? 0x1c2745 : 0x8fc7ea);
  const skyBottom = opts.skyBottom ?? (opts.night ? 0x2c3e6b : 0xdff1fb);
  const g = scene.add.graphics();
  // 바깥 풍경
  g.fillGradientStyle(skyTop, skyTop, skyBottom, skyBottom, 1);
  g.fillRect(x, y, w, h);
  if (opts.night) {
    g.fillStyle(0xfff6d8, 0.95);
    g.fillCircle(x + w * 0.7, y + h * 0.3, Math.min(w, h) * 0.14);
  }
  if (opts.tree !== false) {
    g.fillStyle(opts.night ? 0x24304d : 0x5e9e6c, 1);
    g.fillCircle(x + w * 0.22, y + h * 0.88, w * 0.26);
    g.fillCircle(x + w * 0.5, y + h * 0.97, w * 0.3);
  }
  // 유리 반짝임 (사선 하이라이트)
  g.fillStyle(0xffffff, 0.18);
  g.fillPoints(
    [
      { x: x + w * 0.1, y: y + h },
      { x: x + w * 0.35, y: y },
      { x: x + w * 0.5, y: y },
      { x: x + w * 0.25, y: y + h },
    ],
    true
  );
  // 창틀
  g.lineStyle(6, 0xf0ece0, 1);
  g.strokeRect(x, y, w, h);
  g.lineStyle(4, 0xd8d3c4, 1);
  g.lineBetween(x, y + h / 2, x + w, y + h / 2);
  g.lineBetween(x + w / 2, y, x + w / 2, y + h);
  // 창턱
  g.fillStyle(0xd8d3c4, 1);
  g.fillRect(x - 8, y + h, w + 16, 10);
}

/** 빛줄기 — 창문/조명에서 바닥으로 떨어지는 사다리꼴 광선 */
export function drawLightShaft(
  scene: Phaser.Scene,
  topX: number,
  topY: number,
  topW: number,
  botX: number,
  botY: number,
  botW: number,
  color = 0xfff2c4,
  alpha = 0.1
): void {
  const g = scene.add.graphics();
  g.fillStyle(color, alpha);
  g.fillPoints(
    [
      { x: topX - topW / 2, y: topY },
      { x: topX + topW / 2, y: topY },
      { x: botX + botW / 2, y: botY },
      { x: botX - botW / 2, y: botY },
    ],
    true
  );
}

/** 문 — 패널 + 손잡이 + 명패 */
export function drawDoor(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  color = 0x8a6a48,
  plate?: string
): void {
  const g = scene.add.graphics();
  const dark = Phaser.Display.Color.IntegerToColor(color).darken(25).color;
  // 문틀
  g.fillStyle(dark, 1);
  g.fillRoundedRect(x - 8, y - 8, w + 16, h + 8, 6);
  // 문짝
  g.fillGradientStyle(color, color, dark, dark, 1);
  g.fillRoundedRect(x, y, w, h, 4);
  // 패널 홈 2개
  g.lineStyle(3, dark, 0.8);
  g.strokeRoundedRect(x + w * 0.16, y + h * 0.1, w * 0.68, h * 0.32, 4);
  g.strokeRoundedRect(x + w * 0.16, y + h * 0.52, w * 0.68, h * 0.36, 4);
  // 손잡이
  g.fillStyle(0xd8c060, 1);
  g.fillCircle(x + w - 18, y + h * 0.52, 7);
  if (plate) {
    const px = x + w / 2;
    g.fillStyle(0x1f3b5c, 1);
    g.fillRoundedRect(px - 44, y - 34, 88, 26, 4);
    scene.add
      .text(px, y - 21, plate, { fontFamily: FONT, fontSize: '17px', color: '#f5f5f5' })
      .setOrigin(0.5);
  }
}

/** 관물대 (2문 캐비닛) */
export function drawLockerCabinet(
  scene: Phaser.Scene,
  x: number,
  baseY: number,
  scale = 1
): void {
  const g = scene.add.graphics();
  const w = 130 * scale;
  const h = 230 * scale;
  g.fillStyle(0x50607a, 1);
  g.fillRoundedRect(x - w / 2, baseY - h, w, h, 6 * scale);
  g.lineStyle(2, 0x38455c, 1);
  g.lineBetween(x, baseY - h + 6, x, baseY - 6);
  // 환기 슬릿 + 손잡이
  g.fillStyle(0x38455c, 1);
  for (const side of [-1, 1]) {
    const cx = x + side * w * 0.25;
    for (let i = 0; i < 3; i++) {
      g.fillRect(cx - 14 * scale, baseY - h + (18 + i * 10) * scale, 28 * scale, 4 * scale);
    }
    g.fillRect(cx - side * 4 - 2, baseY - h * 0.5, 5, 18 * scale);
  }
  // 명찰꽂이
  g.fillStyle(0xf0ece0, 1);
  g.fillRect(x - w * 0.42, baseY - h * 0.32, w * 0.34, 14 * scale);
  g.fillRect(x + w * 0.08, baseY - h * 0.32, w * 0.34, 14 * scale);
}

/** 2층 침대 (모포 각 잡힌) */
export function drawBunkBed(
  scene: Phaser.Scene,
  x: number,
  baseY: number,
  scale = 1,
  blanket = 0x2f5546
): void {
  const g = scene.add.graphics();
  const w = 250 * scale;
  const frame = 0x7a6a52;
  const dark = 0x5c4f3c;
  // 기둥
  g.fillStyle(frame, 1);
  g.fillRect(x - w / 2, baseY - 210 * scale, 12 * scale, 210 * scale);
  g.fillRect(x + w / 2 - 12 * scale, baseY - 210 * scale, 12 * scale, 210 * scale);
  // 매트리스 2층
  for (const [ty, label] of [
    [200, false],
    [95, true],
  ] as const) {
    void label;
    const my = baseY - ty * scale;
    g.fillStyle(dark, 1);
    g.fillRect(x - w / 2, my + 26 * scale, w, 10 * scale);
    g.fillStyle(blanket, 1);
    g.fillRoundedRect(x - w / 2 + 6 * scale, my, w - 12 * scale, 28 * scale, 6 * scale);
    // 각 잡힌 모포 흰 줄
    g.fillStyle(0xf0ece0, 0.9);
    g.fillRect(x - w / 2 + 6 * scale, my + 6 * scale, w - 12 * scale, 5 * scale);
    // 베개
    g.fillStyle(0xf5f5f5, 1);
    g.fillRoundedRect(x - w / 2 + 12 * scale, my - 10 * scale, 52 * scale, 16 * scale, 5 * scale);
  }
  // 사다리
  g.fillStyle(frame, 1);
  g.fillRect(x + w / 2 - 40 * scale, baseY - 180 * scale, 6 * scale, 180 * scale);
  for (let i = 0; i < 4; i++) {
    g.fillRect(x + w / 2 - 40 * scale, baseY - (40 + i * 42) * scale, 28 * scale, 6 * scale);
  }
}

/** 형광등 + 은은한 빛 퍼짐 */
export function drawCeilingLight(scene: Phaser.Scene, x: number, y: number, w: number): void {
  const g = scene.add.graphics();
  g.fillStyle(0xfffbe8, 0.1);
  g.fillEllipse(x, y + 26, w * 1.7, 60);
  g.fillStyle(0xdde2ea, 1);
  g.fillRoundedRect(x - w / 2 - 8, y - 10, w + 16, 12, 4);
  g.fillStyle(0xfffbe8, 1);
  g.fillRoundedRect(x - w / 2, y, w, 10, 5);
}

/** 벽시계 */
export function drawWallClock(scene: Phaser.Scene, x: number, y: number, r = 26): void {
  const g = scene.add.graphics();
  g.fillStyle(0x2b2f3c, 1);
  g.fillCircle(x, y, r + 4);
  g.fillStyle(0xf5f5f5, 1);
  g.fillCircle(x, y, r);
  g.lineStyle(3, 0x2b2f3c, 1);
  g.lineBetween(x, y, x, y - r * 0.62);
  g.lineBetween(x, y, x + r * 0.42, y + r * 0.18);
  g.fillStyle(0xe94560, 1);
  g.fillCircle(x, y, 3);
}

/** 게시판 (공지 종이 몇 장) */
export function drawNoticeBoard(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const g = scene.add.graphics();
  g.fillStyle(0x6b5236, 1);
  g.fillRoundedRect(x - 6, y - 6, w + 12, h + 12, 4);
  g.fillStyle(0x93b08a, 1);
  g.fillRect(x, y, w, h);
  const papers = [
    { px: 0.12, py: 0.14, pw: 0.3, ph: 0.5, c: 0xf5f5f5 },
    { px: 0.5, py: 0.1, pw: 0.34, ph: 0.4, c: 0xfff3c4 },
    { px: 0.32, py: 0.55, pw: 0.3, ph: 0.36, c: 0xd8ecf5 },
  ];
  for (const p of papers) {
    g.fillStyle(p.c, 1);
    g.fillRect(x + w * p.px, y + h * p.py, w * p.pw, h * p.ph);
    g.fillStyle(0xe94560, 1);
    g.fillCircle(x + w * (p.px + p.pw / 2), y + h * p.py + 4, 3);
  }
}

/** 소화기 */
export function drawExtinguisher(scene: Phaser.Scene, x: number, baseY: number, scale = 1): void {
  const g = scene.add.graphics();
  g.fillStyle(0xc23b3b, 1);
  g.fillRoundedRect(x - 12 * scale, baseY - 56 * scale, 24 * scale, 56 * scale, 8 * scale);
  g.fillStyle(0x8f2626, 1);
  g.fillRect(x - 5 * scale, baseY - 66 * scale, 10 * scale, 12 * scale);
  g.fillStyle(0x2b2f3c, 1);
  g.fillRect(x - 14 * scale, baseY - 72 * scale, 20 * scale, 7 * scale);
  g.fillStyle(0xffffff, 0.85);
  g.fillRect(x - 7 * scale, baseY - 44 * scale, 14 * scale, 18 * scale);
}

/** 구역 명패 (예: 샤워장 / 세탁실) */
export function drawAreaSign(scene: Phaser.Scene, x: number, y: number, text: string): void {
  const g = scene.add.graphics();
  const w = 34 + text.length * 24;
  g.fillStyle(0x1f3b5c, 1);
  g.fillRoundedRect(x - w / 2, y - 22, w, 44, 8);
  g.lineStyle(2, 0xd8c060, 0.9);
  g.strokeRoundedRect(x - w / 2 + 4, y - 18, w - 8, 36, 6);
  scene.add
    .text(x, y, text, { fontFamily: FONT, fontSize: '24px', color: '#f5f5f5', fontStyle: 'bold' })
    .setOrigin(0.5);
}

/** 세탁기 (드럼, 유리문 하이라이트) */
export function drawWasher(scene: Phaser.Scene, x: number, baseY: number, scale = 1): void {
  const g = scene.add.graphics();
  const w = 118 * scale;
  const h = 150 * scale;
  g.fillStyle(0xe6e9ee, 1);
  g.fillRoundedRect(x - w / 2, baseY - h, w, h, 10 * scale);
  // 컨트롤 패널
  g.fillStyle(0xc7ccd6, 1);
  g.fillRect(x - w / 2, baseY - h, w, 26 * scale);
  g.fillStyle(0x2b2f3c, 1);
  g.fillCircle(x + w * 0.3, baseY - h + 13 * scale, 8 * scale);
  g.fillStyle(0x4ecca3, 1);
  g.fillRect(x - w * 0.36, baseY - h + 9 * scale, 26 * scale, 8 * scale);
  // 드럼 유리문
  g.fillStyle(0x9aa3b2, 1);
  g.fillCircle(x, baseY - h * 0.44, 40 * scale);
  g.fillStyle(0x30455c, 1);
  g.fillCircle(x, baseY - h * 0.44, 32 * scale);
  g.fillStyle(0x4a6a8c, 1);
  g.fillCircle(x, baseY - h * 0.44, 24 * scale);
  g.fillStyle(0xffffff, 0.35);
  g.fillEllipse(x - 10 * scale, baseY - h * 0.44 - 10 * scale, 20 * scale, 12 * scale);
}

/** 가로등 (따뜻한 광원) */
export function drawStreetlight(
  scene: Phaser.Scene,
  x: number,
  baseY: number,
  h: number,
  dir: 1 | -1 = 1
): void {
  const g = scene.add.graphics();
  g.fillStyle(0x3c4254, 1);
  g.fillRect(x - 4, baseY - h, 8, h);
  g.fillRect(x - 4, baseY - h, 36 * dir, 6);
  const lx = x + 32 * dir;
  g.fillStyle(0xffe9a8, 1);
  g.fillEllipse(lx, baseY - h + 10, 26, 14);
  g.fillStyle(0xffe9a8, 0.12);
  g.fillCircle(lx, baseY - h + 14, 46);
}

/** 화면 가장자리 비네트 (무드용, 위험 비네트보다 낮은 depth) */
export function addVignette(scene: Phaser.Scene, alpha = 0.3): void {
  const g = scene.add.graphics().setDepth(2300);
  const e = 130;
  g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, alpha, alpha, 0, 0);
  g.fillRect(0, 0, GAME_WIDTH, e);
  g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, alpha, alpha);
  g.fillRect(0, GAME_HEIGHT - e, GAME_WIDTH, e);
  g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, alpha, 0, alpha, 0);
  g.fillRect(0, e, e, GAME_HEIGHT - e * 2);
  g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, alpha, 0, alpha);
  g.fillRect(GAME_WIDTH - e, e, e, GAME_HEIGHT - e * 2);
}
