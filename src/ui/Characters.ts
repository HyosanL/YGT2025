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
/** 똑바로 선 키를 그대로 유지해야 하는 자세 — 배율을 선 자세에 고정한다.
 *  (웅크리기·탈진·숨기처럼 실제로 낮아지는 자세는 여기서 뺀다) */
const UPRIGHT = new Set<CadetMotion>(['idle', 'walk', 'run', 'salute', 'dance', 'cheer', 'point', 'charge']);

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
  /** 선 자세 기준 높이 캐시 (setBack/dobok 전환 시 무효화) */
  private baseH: number | null = null;

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
    // 견장은 포즈가 바뀌어도 그대로 — 한 번만 얹는다 (방문자는 자세가 고정이다)
    if (this.visitorRank) this.drawRankBoards(this.visitorRank);
  }

  /**
   * 어깨 견장을 코드로 그린다.
   *
   * 견장 줄 수는 복도 판별 게임의 **유일한 단서**인데, 생성 모델은 "줄 3개"를 요구해도
   * 2개나 4개를 그리기 일쑤였다. 그래서 방문자는 무늬 없는 한 장(`visitor_base`)만 쓰고
   * 계급 줄은 여기서 정확히 rank개 찍는다 — 개수가 틀릴 수 없고, 크기도 마음대로 키운다.
   *
   * 좌표는 원본 스프라이트에서 실측한 어깨 위치의 '비율'이라 어떤 배율에서도 따라온다.
   */
  private drawRankBoards(rank: 1 | 2 | 3): void {
    const src = this.sprite.texture.getSourceImage() as { width?: number; height?: number };
    const texW = src.width || 1;
    const texH = src.height || 1;
    const dispH = BASE_H;
    const dispW = (texW / texH) * dispH;
    // 텍스처 비율 → 컨테이너 로컬 좌표 (스프라이트는 밑변이 FOOT_Y에 붙어 있다)
    const lx = (fx: number): number => (fx - 0.5) * dispW;
    const ly = (fy: number): number => FOOT_Y - (1 - fy) * dispH;

    const g = this.scene.add.graphics();
    const boardW = 0.135 * dispW;
    const boardH = 0.055 * dispH;
    for (const fx of [0.2, 0.8]) {
      const cx = lx(fx);
      const cy = ly(0.222);
      // 남색 견장판 + 굵은 검정 외곽선 (배경에서 확실히 떨어져 보이게)
      g.fillStyle(0x1b2540, 1);
      g.fillRoundedRect(cx - boardW / 2, cy - boardH / 2, boardW, boardH, boardH * 0.28);
      g.lineStyle(Math.max(2, boardH * 0.16), 0x14141a, 1);
      g.strokeRoundedRect(cx - boardW / 2, cy - boardH / 2, boardW, boardH, boardH * 0.28);
      // 금색 줄 rank개 — 판 안쪽에 균등 배치
      const barH = boardH * 0.19;
      const gap = boardH * 0.12;
      const total = rank * barH + (rank - 1) * gap;
      g.fillStyle(0xffc93c, 1);
      for (let i = 0; i < rank; i++) {
        g.fillRect(
          cx - boardW * 0.34,
          cy - total / 2 + i * (barH + gap),
          boardW * 0.68,
          barH
        );
      }
    }
    this.add(g);
  }

  private texFor(motion: CadetMotion): string {
    if (this.visitorRank) {
      if (motion === 'salute') return 'visitor_salute';
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
    this.baseH = null; // 앞/뒤 에셋은 키가 다를 수 있다 — 기준 높이 재측정
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
   * 에셋은 투명 여백을 트림해 두어 파일 높이 = 인물의 실제 세로 길이다. 그래서 프레임마다
   * 높이로 스케일을 따로 계산하면, 무릎을 굽힌 구보 프레임처럼 세로가 짧은 포즈가 도리어
   * 확대되어 걷는 내내 덩치가 커졌다 작아졌다 한다.
   * 순환 애니메이션은 `refH`(첫 프레임 높이)를 넘겨 **두 프레임이 같은 배율**을 쓰게 한다.
   */
  private applyTexture(key: string, refH?: number): void {
    if (!this.scene.textures.exists(key)) return;
    this.sprite.setTexture(key);
    const src = this.sprite.texture.getSourceImage() as { height?: number };
    const th = refH || src.height || this.sprite.height || BASE_H;
    this.sprite.setScale(BASE_H / th);
  }

  /** 트림된 원본 텍스처의 세로 픽셀 수 (스케일 기준값) */
  private texHeight(key: string): number {
    const src = this.scene.textures.get(key).getSourceImage() as { height?: number };
    return src.height || BASE_H;
  }

  /**
   * 이 캐릭터의 모든 자세가 공유하는 기준 높이 = 똑바로 선 자세(idle)의 픽셀 높이.
   * 모든 컷이 같은 카메라 거리에서 그려졌으므로, 서 있는 키 하나로 배율을 고정해야
   * 구보(무릎 굽힘)·경례처럼 세로가 짧은 포즈가 확대되지 않는다.
   * 반대로 웅크리기·탈진처럼 정말 낮은 자세는 낮은 대로 보이는 게 맞다.
   */
  private standH(): number {
    if (this.baseH === null) this.baseH = this.texHeight(this.texFor('idle'));
    return this.baseH;
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

    const cycleKey = this.visitorRank
      ? `visitor.${motion}`
      : this.dobok && (motion === 'run' || motion === 'walk')
        ? `${this.back ? 'dobok_back' : 'dobok'}.${motion}`
        : `${this.kind}.${motion}`;
    const cycle = CYCLE[cycleKey];
    // 걷기·구보처럼 '서서 이동하는' 자세는 선 키(standH)를 공통 배율로 쓴다
    const uprightH = UPRIGHT.has(motion) ? this.standH() : undefined;

    if (cycle && this.scene.textures.exists(cycle[0]) && this.scene.textures.exists(cycle[1])) {
      let i = 0;
      this.applyTexture(cycle[0], uprightH);
      this.cycleTimer = this.scene.time.addEvent({
        delay: motion === 'run' ? 110 : 300,
        loop: true,
        callback: () => {
          if (!this.active) return;
          i ^= 1;
          this.applyTexture(cycle[i], uprightH);
        },
      });
      return;
    }

    this.applyTexture(this.texFor(motion), uprightH);

    if (motion === 'idle' || motion === 'dance') {
      this.idleTween = this.scene.tweens.add({
        targets: this.sprite,
        y: FOOT_Y + (motion === 'dance' ? -8 : -4),
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
