import Phaser from 'phaser';
import { COLORS, FONT, UI } from '../config';

export type CadetKind = 'player' | 'junior' | 'peer' | 'senior' | 'duty';
export type CadetMotion =
  | 'idle' | 'walk' | 'run' | 'dance' | 'salute'
  | 'cheer' | 'exhausted' | 'sneak' | 'lying' | 'lying_punch' | 'point' | 'hide'
  /** 게임오버 — 카메라 정면으로 달려든다 */
  | 'charge';

/** 옛 절차 드로잉 시절의 스타일 필드 — 색상값은 이제 무시되고 dobok/scale만 쓰인다 (호환용). */
export interface CadetStyle {
  uniform?: number;
  uniformDark?: number;
  trousers?: number;
  shoe?: number;
  cap?: number;
  capBand?: number;
  skin?: number;
  hair?: number;
  rank?: number;
  scale?: number;
  face?: string;
  label?: string;
  armband?: boolean;
  bigCap?: boolean;
  /** 태권도 도복 룩 (Q4) */
  dobok?: boolean;
  belt?: number;
  /** Q2 판별용 중립 방문자 — 얼굴·근무복 동일, 오직 견장 줄 수(1/2/3)만 다른 이미지 사용 */
  visitorRank?: 1 | 2 | 3;
  /** 카메라를 등지고 화면 안쪽으로 향하는 뒷모습 (전자레인지 앞·무용관 가는 길) */
  back?: boolean;
}

/** 캐릭터가 컨테이너 scale 1일 때의 표시 높이(px) — 씬 setScale이 여기에 곱해진다. */
const BASE_H = 300;
/**
 * 컨테이너 로컬 좌표에서 **발이 닿는 바닥선**. 그림자도 여기 놓인다.
 * 스프라이트를 이 선에 '밑변 기준'으로 붙여야, 자세마다 키가 달라도 발이 뜨지 않는다.
 * (선 자세 기준으로 배율을 고정하면서 origin이 중앙이면 짧은 포즈가 공중에 뜬다)
 */
const FOOT_Y = BASE_H * 0.4;

const LABELS: Record<CadetKind, string> = {
  player: '생도 (2학년)',
  junior: '후배 (1학년)',
  peer: '동기 (2학년)',
  senior: '선배 (3학년)',
  duty: '당직훈육관',
};

/** kind+motion → 텍스처 키. 없는 모션은 idle로 폴백. */
const POSE: Record<CadetKind, Partial<Record<CadetMotion, string>>> = {
  player: {
    idle: 'player_idle', walk: 'player_walk_a', run: 'player_run', dance: 'player_dance',
    salute: 'player_salute', cheer: 'player_cheer', exhausted: 'player_exhausted',
    sneak: 'player_sneak', lying: 'player_lying', lying_punch: 'player_lying_punch',
    hide: 'player_hide_door',
  },
  junior: { idle: 'junior_walk', walk: 'junior_walk', run: 'junior_walk', salute: 'junior_salute' },
  peer: { idle: 'peer_idle', walk: 'peer_walk', run: 'peer_walk', salute: 'peer_idle' },
  senior: {
    idle: 'senior_idle', walk: 'senior_walk', run: 'senior_run', salute: 'senior_idle',
    point: 'senior_point', charge: 'senior_charge',
  },
  // 당직훈육관 — 전투복+전투모+훈육 완장. 심야 취사장을 도는 건 선배가 아니라 이 사람이다.
  duty: {
    idle: 'duty_idle', walk: 'duty_walk_a', run: 'duty_charge', salute: 'duty_idle',
    point: 'duty_idle', charge: 'duty_charge',
  },
};
const DOBOK: Partial<Record<CadetMotion, string>> = {
  idle: 'player_dobok_walk', walk: 'player_dobok_walk', run: 'player_dobok_run',
};
/** 도복 뒷모습 (Q4 — 무용관 쪽으로 달려가는 등을 본다) */
const DOBOK_BACK: Partial<Record<CadetMotion, string>> = {
  idle: 'player_dobok_walk_back', walk: 'player_dobok_walk_back', run: 'player_dobok_run_back',
};
/** 근무복 뒷모습 (Q3 — 전자레인지를 마주 본 등) */
const BACK: Partial<Record<CadetMotion, string>> = {
  idle: 'player_back_idle', walk: 'player_back_idle', run: 'player_back_idle',
};
/**
 * 4프레임 러닝 사이클 (재렌더 에셋) — 파일이 전부 로드된 세트만 쓰고,
 * 없으면 아래 2프레임 순환으로 폴백한다. 접지→공중→반대접지→공중 표준 사이클.
 */
const CYCLE4: Record<string, string[]> = {
  // 4프레임 진짜 사이클 (전 프레임 별도 생성 — 방향·디테일 일관)
  'player.run': ['player_run_f1', 'player_run_f2', 'player_run_f3', 'player_run_f4'],
  'senior.run': ['senior_run_f1', 'senior_run_f2', 'senior_run_f3', 'senior_run_f4'],
  'duty.run': ['duty_charge_f1', 'duty_charge_f2', 'duty_charge_f3', 'duty_charge_f4'],
  'duty.charge': ['duty_charge_f1', 'duty_charge_f2', 'duty_charge_f3', 'duty_charge_f4'],
  // 반대 위상(f3/f4)까지 전부 개별 렌더된 진짜 4프레임 사이클 — 미러 프레임 없음
  'dobok.run': [
    'player_dobok_run_f1',
    'player_dobok_run_f2',
    'player_dobok_run_f3',
    'player_dobok_run_f4',
  ],
  'dobok_back.run': [
    'player_dobok_run_back_f1',
    'player_dobok_run_back_f2',
    'player_dobok_run_back_f3',
    'player_dobok_run_back_f4',
  ],
  'visitor.walk': ['visitor_walk_f1', 'visitor_walk_f2', 'visitor_walk_f3', 'visitor_walk_f4'],
  'duty.walk': ['duty_walk_f1', 'duty_walk_f2', 'duty_walk_f3', 'duty_walk_f4'],
  'dobok_back.walk': [
    'player_dobok_walk_back_f1',
    'player_dobok_walk_back_f2',
    'player_dobok_walk_back_f3',
    'player_dobok_walk_back_f4',
  ],
};

/** 2프레임 순환 (걷기/구보 애니메이션) */
const CYCLE: Record<string, [string, string]> = {
  'player.walk': ['player_walk_a', 'player_walk_b'],
  'player.run': ['player_run', 'player_run_b'],
  'senior.run': ['senior_run', 'senior_run_b'],
  'senior.walk': ['senior_walk', 'senior_walk_b'],
  'senior.charge': ['senior_charge', 'senior_charge_b'],
  'duty.walk': ['duty_walk_a', 'duty_walk_b'],
  'duty.run': ['duty_charge', 'duty_charge_b'],
  'duty.charge': ['duty_charge', 'duty_charge_b'],
  // 복도 방문자 — 걸어오는 2프레임 (한 장짜리면 한 발 든 채 미끄러진다)
  'visitor.walk': ['visitor_walk_a', 'visitor_walk_b'],
  'dobok.walk': ['player_dobok_walk', 'player_dobok_walk_b'],
  'dobok.run': ['player_dobok_run', 'player_dobok_run_b'],
  'dobok_back.walk': ['player_dobok_walk_back', 'player_dobok_walk_back_b'],
  'dobok_back.run': ['player_dobok_run_back', 'player_dobok_run_back_b'],
};

/** 눕는 포즈 — 그림자/바운스를 끈다 */
const LYING = new Set<CadetMotion>(['lying', 'lying_punch']);

interface ContentBounds {
  /** 불투명 내용의 세로 픽셀 수 */
  h: number;
  /** 불투명 내용의 가로 픽셀 수 */
  w: number;
  /** 캔버스 하단의 투명 여백 (발끝을 바닥선에 붙일 때 보정) */
  padBottom: number;
  /** 내용 가로 중심이 캔버스 중심에서 벗어난 양(px) — 프레임 간 좌우 뒤뚱거림 보정 */
  dx: number;
}

/**
 * 텍스처의 실제 그림 내용 경계 (알파 스캔, 전역 캐시).
 *
 * 에셋 캔버스는 512px로 통일돼 있지만 **그림 속 인물 크기(줌)는 컷 세트마다 다르다** —
 * 캔버스 높이로만 배율을 정하면 걷기↔구보 전환 때 덩치가 눈에 띄게 커졌다 작아졌다 한다.
 * 그래서 순환 애니메이션은 내용 높이를 기준으로 선 자세와 같은 크기가 되도록 보정한다.
 */
const boundsCache = new Map<string, ContentBounds>();

function contentBounds(scene: Phaser.Scene, key: string): ContentBounds {
  const cached = boundsCache.get(key);
  if (cached) return cached;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const w = src.width || 1;
  const h = src.height || 1;
  let out: ContentBounds = { h, w, padBottom: 0, dx: 0 };
  try {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    if (cx) {
      cx.drawImage(src as CanvasImageSource, 0, 0);
      const a = cx.getImageData(0, 0, w, h).data;
      let top = -1;
      let bottom = -1;
      let left = w;
      let right = -1;
      for (let y = 0; y < h; y++) {
        const off = y * w * 4 + 3;
        for (let x = 0; x < w; x++) {
          if ((a[off + x * 4] ?? 0) > 16) {
            if (top < 0) top = y;
            bottom = y;
            if (x < left) left = x;
            if (x > right) right = x;
          }
        }
      }
      if (top >= 0 && bottom >= top && right >= left) {
        out = {
          h: bottom - top + 1,
          w: right - left + 1,
          padBottom: h - 1 - bottom,
          dx: (left + right + 1) / 2 - w / 2,
        };
      }
    }
  } catch {
    // 캔버스 접근 실패(CORS 등) 시 캔버스 크기 기준으로 폴백
  }
  boundsCache.set(key, out);
  return out;
}

export class Cadet extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  private kind: CadetKind;
  private dobok: boolean;
  private back: boolean;
  private visitorRank?: 1 | 2 | 3;
  private motion: CadetMotion | null = null;
  private cycleTimer: Phaser.Time.TimerEvent | null = null;
  private idleTween: Phaser.Tweens.Tween | null = null;
  /** 코드로 그린 견장 — 기본(걷기/대기) 컷용. 줄 수는 반드시 코드가 보증한다 */
  private rankG: Phaser.GameObjects.Graphics | null = null;
  /** 경례 컷(junior_salute 차용)용 견장 — 컷마다 어깨 위치가 달라 따로 그린다 */
  private rankSaluteG: Phaser.GameObjects.Graphics | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    kind: CadetKind,
    showLabel = false,
    styleOverride?: Partial<CadetStyle>
  ) {
    super(scene, x, y);
    this.kind = kind;
    this.dobok = styleOverride?.dobok ?? false;
    this.back = styleOverride?.back ?? false;
    this.visitorRank = styleOverride?.visitorRank;

    // 스프라이트는 여백을 트림해 두어 밑변 = 발끝 → 그림자를 정확히 발밑에 둔다 (둥둥 뜨는 것 방지)
    this.shadow = scene.add.ellipse(0, FOOT_Y, BASE_H * 0.3, BASE_H * 0.06, 0x2b5f9e, 0.22);
    this.add(this.shadow);

    // origin을 '밑변'으로 두고 바닥선에 붙인다 — 어떤 배율이든 발끝이 그림자에 정확히 온다
    this.sprite = scene.add.image(0, FOOT_Y, this.texFor('idle')).setOrigin(0.5, 1);
    this.add(this.sprite);

    if (showLabel) {
      this.add(
        scene.add
          .text(0, BASE_H * 0.5, LABELS[kind], { fontFamily: FONT, fontSize: '24px', color: '#39507a' })
          .setOrigin(0.5)
      );
    }

    scene.add.existing(this);
    this.setMotion('idle');
    // 견장은 applyTexture의 layoutRankBoards가 컷마다 어깨 위치에 맞춰 그린다
  }

  /**
   * 특정 텍스처 기준의 견장 그래픽 생성.
   * 좌표는 해당 컷에서 실측한 어깨 위치의 '비율'이라 어떤 배율에서도 따라온다.
   */
  private buildRankBoards(
    rank: 1 | 2 | 3,
    texKey: string,
    shoulderFxs: [number, number],
    shoulderFy: number,
    boardWFactor: number
  ): Phaser.GameObjects.Graphics {
    const src = this.scene.textures.get(texKey).getSourceImage() as {
      width?: number;
      height?: number;
    };
    const texW = src.width || 1;
    const texH = src.height || 1;
    const dispH = BASE_H;
    const dispW = (texW / texH) * dispH;
    // 텍스처 비율 → 컨테이너 로컬 좌표 (스프라이트는 밑변이 FOOT_Y에 붙어 있다)
    const lx = (fx: number): number => (fx - 0.5) * dispW;
    const ly = (fy: number): number => FOOT_Y - (1 - fy) * dispH;

    const g = this.scene.add.graphics();
    const boardW = boardWFactor * dispW;
    const boardH = 0.055 * dispH;
    for (const fx of shoulderFxs) {
      const cx = lx(fx);
      const cy = ly(shoulderFy);
      // 남색 견장판 + 굵은 검정 외곽선 (배경에서 확실히 떨어져 보이게)
      g.fillStyle(0x1b2540, 1);
      g.fillRoundedRect(cx - boardW / 2, cy - boardH / 2, boardW, boardH, boardH * 0.28);
      g.lineStyle(Math.max(2, boardH * 0.16), 0x14141a, 1);
      g.strokeRoundedRect(cx - boardW / 2, cy - boardH / 2, boardW, boardH, boardH * 0.28);
      // 금색 **세로줄** rank개 — 실제 견장처럼 세로 방향으로 긋고 가로로 나란히 배치
      const barW = boardW * 0.15;
      const gap = boardW * 0.11;
      const total = rank * barW + (rank - 1) * gap;
      g.fillStyle(0xffc93c, 1);
      for (let i = 0; i < rank; i++) {
        g.fillRect(
          cx - total / 2 + i * (barW + gap),
          cy - boardH * 0.32,
          barW,
          boardH * 0.64
        );
      }
    }
    return g;
  }

  private texFor(motion: CadetMotion): string {
    if (this.visitorRank) {
      // visitor_salute는 경례 팔꿈치가 캔버스 밖으로 잘린 에셋이라 팔이 온전한
      // junior_salute를 쓴다 — 경례를 올린 시점엔 이미 후배임이 드러난 뒤라 무방하다
      if (motion === 'salute') {
        return this.scene.textures.exists('junior_salute') ? 'junior_salute' : 'visitor_salute';
      }
      if (motion === 'walk' || motion === 'run') return 'visitor_walk_a';
      return 'visitor_base';
    }
    const front = this.dobok ? DOBOK : POSE[this.kind];
    const table = this.back ? (this.dobok ? DOBOK_BACK : BACK) : front;
    // 뒷모습 에셋이 없는 모션은 정면 포즈로 자연스럽게 폴백한다
    const candidates = [table[motion], table.idle, front[motion], front.idle, 'player_idle'];
    for (const key of candidates) {
      if (key && this.scene.textures.exists(key)) return key;
    }
    return 'player_idle';
  }

  /** 카메라를 등지는지 전환 (전자레인지 앞 ↔ 세탁실 문 안 등) */
  setBack(back: boolean): this {
    if (this.back === back) return this;
    this.back = back;
    const motion = this.motion ?? 'idle';
    this.motion = null;
    this.setMotion(motion);
    return this;
  }

  /** 스프라이트에만 적용되는 틴트 — 어두운 문 안, 야간 등 */
  setBodyTint(color?: number): this {
    if (color === undefined) this.sprite.clearTint();
    else this.sprite.setTint(color);
    return this;
  }

  /**
   * 텍스처 교체 + 크기 정규화.
   *
   * 기본은 캔버스 높이 기준(모든 캔버스 512px로 동일)이라 어떤 포즈든 배율이 같다.
   * 순환 애니메이션(걷기/구보)은 `anchorKey`(이 캐릭터의 선 자세)를 넘긴다 —
   * 컷 세트마다 그림 속 인물 줌이 달라도 **내용 높이**를 선 자세에 맞춰 보정하므로
   * 걷기↔구보 전환 때 덩치가 커졌다 작아졌다 하지 않는다. 캔버스 하단 투명 여백만큼
   * 스프라이트를 내려 발끝(내용 밑변)이 바닥선에 정확히 붙는다.
   */
  private applyTexture(key: string, anchorKey?: string): void {
    if (!this.scene.textures.exists(key)) return;
    this.sprite.setTexture(key);
    if (anchorKey && this.scene.textures.exists(anchorKey)) {
      const anchor = contentBounds(this.scene, anchorKey);
      const anchorSrc = this.scene.textures.get(anchorKey).getSourceImage() as { height?: number };
      const own = contentBounds(this.scene, key);
      // 목표: 이 컷의 내용 높이 = 선 자세의 내용 높이가 화면에서 차지하는 높이
      const anchorDispH = (anchor.h / (anchorSrc.height || BASE_H)) * BASE_H;
      const scale = anchorDispH / Math.max(1, own.h);
      this.sprite.setScale(scale);
      // 내용의 가로 중심을 컨테이너 중심에 정렬 — 프레임마다 그림이 캔버스 안에서
      // 좌우로 치우쳐 있으면 걸을 때 몸이 좌우로 뒤뚱거린다
      this.sprite.setPosition(-own.dx * scale, FOOT_Y + own.padBottom * scale);
      this.layoutRankBoards(own.w * scale, own.h * scale);
      return;
    }
    const src = this.sprite.texture.getSourceImage() as { height?: number };
    const th = src.height || this.sprite.height || BASE_H;
    this.sprite.setScale(BASE_H / th);
    this.sprite.setPosition(0, FOOT_Y);
    const own = contentBounds(this.scene, key);
    this.layoutRankBoards(own.w * (BASE_H / th), own.h * (BASE_H / th));
  }

  /**
   * 코드 견장을 현재 컷의 **내용(그림) 박스** 어깨 위치에 다시 그린다.
   * 프레임마다 그림 크기·위치가 달라 고정 좌표로 두면 견장이 허공에 점처럼 뜬다.
   */
  private layoutRankBoards(contentW: number, contentH: number): void {
    if (!this.visitorRank || this.motion === 'salute') return;
    this.rankG?.destroy();
    const g = this.scene.add.graphics();
    const boardW = 0.15 * contentW;
    const boardH = 0.055 * contentH;
    const top = FOOT_Y - contentH; // 내용 밑변은 항상 FOOT_Y에 정렬돼 있다
    for (const fx of [0.22, 0.78]) {
      const cx = (fx - 0.5) * contentW;
      const cy = top + 0.222 * contentH;
      g.fillStyle(0x1b2540, 1);
      g.fillRoundedRect(cx - boardW / 2, cy - boardH / 2, boardW, boardH, boardH * 0.28);
      g.lineStyle(Math.max(2, boardH * 0.16), 0x14141a, 1);
      g.strokeRoundedRect(cx - boardW / 2, cy - boardH / 2, boardW, boardH, boardH * 0.28);
      const barW = boardW * 0.15;
      const gap = boardW * 0.11;
      const total = this.visitorRank * barW + (this.visitorRank - 1) * gap;
      g.fillStyle(0xffc93c, 1);
      for (let i = 0; i < this.visitorRank; i++) {
        g.fillRect(cx - total / 2 + i * (barW + gap), cy - boardH * 0.32, barW, boardH * 0.64);
      }
    }
    this.add(g);
    this.rankG = g;
  }

  setFace(_emoji: string): void {
    // 포즈 이미지에 표정이 포함되어 있어 별도 처리 없음 (호환용 no-op)
  }

  setMotion(motion: CadetMotion): void {
    if (!this.active || this.motion === motion) return;
    this.motion = motion;
    this.cycleTimer?.remove();
    this.cycleTimer = null;
    this.idleTween?.remove();
    this.idleTween = null;
    this.sprite.setPosition(0, FOOT_Y);

    this.shadow.setVisible(!LYING.has(motion));

    // 경례 컷(junior_salute 차용)은 어깨 위치가 달라 전용 견장으로 갈아 끼운다 —
    // 어느 컷에서든 줄 수는 코드가 그린 견장이 보증한다 (에셋에 박힌 견장은 못 믿는다)
    if (this.visitorRank) {
      const saluting = motion === 'salute';
      this.rankG?.setVisible(!saluting);
      if (saluting && !this.rankSaluteG && this.scene.textures.exists('junior_salute')) {
        this.rankSaluteG = this.buildRankBoards(
          this.visitorRank,
          'junior_salute',
          [0.305, 0.815],
          0.22,
          0.19
        );
        this.add(this.rankSaluteG);
      }
      this.rankSaluteG?.setVisible(saluting);
    }

    const cycleKey = this.visitorRank
      ? `visitor.${motion}`
      : this.dobok && (motion === 'run' || motion === 'walk')
        ? `${this.back ? 'dobok_back' : 'dobok'}.${motion}`
        : `${this.kind}.${motion}`;
    // 4프레임 재렌더 세트가 전부 로드돼 있으면 우선 사용, 아니면 2프레임 폴백
    const four = CYCLE4[cycleKey];
    const cycle: string[] | undefined =
      four && four.every((k) => this.scene.textures.exists(k)) ? four : CYCLE[cycleKey];
    // 걷기·구보 순환은 이 캐릭터의 '선 자세'를 내용 높이 기준점으로 쓴다
    const anchorKey = this.texFor('idle');

    if (cycle && cycle.every((k) => this.scene.textures.exists(k))) {
      let i = 0;
      this.applyTexture(cycle[0] ?? '', anchorKey);
      // 한 사이클(왕복)의 체감 속도를 프레임 수와 무관하게 유지
      // (4프레임 구보는 220ms/사이클이면 발이 너무 파닥거린다 — 살짝 여유)
      const runCycleMs = cycle.length > 2 ? 320 : 220;
      const delay = (motion === 'run' ? runCycleMs : 600) / cycle.length;
      this.cycleTimer = this.scene.time.addEvent({
        delay,
        loop: true,
        callback: () => {
          if (!this.active) return;
          i = (i + 1) % cycle.length;
          this.applyTexture(cycle[i] ?? '', anchorKey);
        },
      });
      return;
    }

    this.applyTexture(this.texFor(motion));

    if (motion === 'idle' || motion === 'dance') {
      const baseY = this.sprite.y;
      this.idleTween = this.scene.tweens.add({
        targets: this.sprite,
        y: baseY + (motion === 'dance' ? -8 : -4),
        duration: motion === 'dance' ? 300 : 750,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  /** 거수경례 후 원래 동작으로 복귀 */
  saluteOnce(holdMs = 800): void {
    if (!this.active) return;
    const prev = this.motion ?? 'idle';
    this.setMotion('salute');
    this.scene.time.delayedCall(holdMs, () => {
      if (this.active && this.motion === 'salute') this.setMotion(prev === 'salute' ? 'idle' : prev);
    });
  }

  /** 벽치기 한 방 — 누운 채 주먹을 뻗는 포즈로 잠깐 전환 */
  punchOnce(dir: 'left' | 'right'): void {
    if (!this.active) return;
    const prev = this.motion ?? 'lying';
    this.applyTexture(this.texFor('lying_punch'));
    this.scene.tweens.add({
      targets: this.sprite,
      x: dir === 'left' ? -14 : 14,
      duration: 80,
      yoyo: true,
      ease: 'Cubic.easeOut',
    });
    this.scene.time.delayedCall(220, () => {
      if (this.active) this.applyTexture(this.texFor(prev));
    });
  }

  destroy(fromScene?: boolean): void {
    if (!fromScene) {
      this.cycleTimer?.remove();
      this.idleTween?.remove();
    }
    this.cycleTimer = null;
    this.idleTween = null;
    super.destroy(fromScene);
  }
}

/** 말풍선 (잠깐 표시 후 자동 소멸) */
export function speechBubble(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  durationMs = 1200,
  depth = 800
): void {
  const box = scene.add.container(x, y).setDepth(depth);
  const label = scene.add
    .text(0, 0, text, { fontFamily: FONT, fontSize: '30px', color: COLORS.inkCss, align: 'center' })
    .setOrigin(0.5);
  const w = label.width + 40;
  const h = label.height + 26;
  const g = scene.add.graphics();
  g.fillStyle(COLORS.ink, 1);
  g.fillRoundedRect(-w / 2 + UI.shadow, -h / 2 + UI.shadow, w, h, UI.radius);
  g.fillStyle(COLORS.white, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, UI.radius);
  g.lineStyle(UI.stroke, COLORS.ink, 1);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, UI.radius);
  // 아래쪽 꼬리
  g.fillStyle(COLORS.white, 1);
  g.fillTriangle(-14, h / 2 - 2, 14, h / 2 - 2, 0, h / 2 + 20);
  g.lineStyle(UI.stroke, COLORS.ink, 1);
  g.lineBetween(-14, h / 2, 0, h / 2 + 20);
  g.lineBetween(14, h / 2, 0, h / 2 + 20);
  box.add([g, label]);
  box.setY(y - h / 2 - 18);

  scene.tweens.add({ targets: box, y: box.y - 20, duration: durationMs });
  scene.time.delayedCall(durationMs, () => box.destroy());
}
