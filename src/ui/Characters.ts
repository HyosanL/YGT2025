import Phaser from 'phaser';
import { FONT } from '../config';

export type CadetKind = 'player' | 'junior' | 'peer' | 'senior';
export type CadetMotion =
  | 'idle' | 'walk' | 'run' | 'dance' | 'salute'
  | 'cheer' | 'exhausted' | 'sneak' | 'lying' | 'lying_punch' | 'point';

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
}

/** 캐릭터가 컨테이너 scale 1일 때의 표시 높이(px) — 씬 setScale이 여기에 곱해진다. */
const BASE_H = 300;

const LABELS: Record<CadetKind, string> = {
  player: '생도 (2학년)',
  junior: '후배 (1학년)',
  peer: '동기 (2학년)',
  senior: '선배 (3학년)',
};

/** kind+motion → 텍스처 키. 없는 모션은 idle로 폴백. */
const POSE: Record<CadetKind, Partial<Record<CadetMotion, string>>> = {
  player: {
    idle: 'player_idle', walk: 'player_walk_a', run: 'player_run', dance: 'player_dance',
    salute: 'player_salute', cheer: 'player_cheer', exhausted: 'player_exhausted',
    sneak: 'player_sneak', lying: 'player_lying', lying_punch: 'player_lying_punch',
  },
  junior: { idle: 'junior_walk', walk: 'junior_walk', run: 'junior_walk', salute: 'junior_salute' },
  peer: { idle: 'peer_idle', walk: 'peer_walk', run: 'peer_walk', salute: 'peer_idle' },
  senior: { idle: 'senior_idle', walk: 'senior_walk', run: 'senior_run', salute: 'senior_idle', point: 'senior_point' },
};
const DOBOK: Partial<Record<CadetMotion, string>> = {
  idle: 'player_dobok_walk', walk: 'player_dobok_walk', run: 'player_dobok_run',
};
/** 2프레임 순환 (걷기/구보 애니메이션) */
const CYCLE: Record<string, [string, string]> = {
  'player.walk': ['player_walk_a', 'player_walk_b'],
  'player.run': ['player_run', 'player_run_b'],
  'senior.run': ['senior_run', 'senior_run'],
  'dobok.walk': ['player_dobok_walk', 'player_dobok_walk_b'],
  'dobok.run': ['player_dobok_run', 'player_dobok_run_b'],
};

/** 눕는 포즈 — 그림자/바운스를 끈다 */
const LYING = new Set<CadetMotion>(['lying', 'lying_punch']);

export class Cadet extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  private kind: CadetKind;
  private dobok: boolean;
  private visitorRank?: 1 | 2 | 3;
  private motion: CadetMotion | null = null;
  private cycleTimer: Phaser.Time.TimerEvent | null = null;
  private idleTween: Phaser.Tweens.Tween | null = null;

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
    this.visitorRank = styleOverride?.visitorRank;

    // 스프라이트는 여백을 트림해 두어 밑변 = 발끝 → 그림자를 정확히 발밑에 둔다 (둥둥 뜨는 것 방지)
    this.shadow = scene.add.ellipse(0, BASE_H * 0.4, BASE_H * 0.3, BASE_H * 0.06, 0x2b5f9e, 0.22);
    this.add(this.shadow);

    this.sprite = scene.add.image(0, 0, this.texFor('idle')).setOrigin(0.5, 0.6);
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
  }

  private texFor(motion: CadetMotion): string {
    if (this.visitorRank) return `visitor_${this.visitorRank}line`;
    const table = this.dobok ? DOBOK : POSE[this.kind];
    return table[motion] || table.idle || POSE[this.kind].idle || 'player_idle';
  }

  private applyTexture(key: string): void {
    if (!this.scene.textures.exists(key)) return;
    this.sprite.setTexture(key);
    const src = this.sprite.texture.getSourceImage() as { height?: number };
    const th = src.height || this.sprite.height || BASE_H;
    this.sprite.setScale(BASE_H / th);
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
    this.sprite.setPosition(0, 0);

    this.shadow.setVisible(!LYING.has(motion));

    const cycleKey =
      this.dobok && (motion === 'run' || motion === 'walk')
        ? `dobok.${motion}`
        : `${this.kind}.${motion}`;
    const cycle = CYCLE[cycleKey];
    if (cycle) {
      let i = 0;
      this.applyTexture(cycle[0]);
      this.cycleTimer = this.scene.time.addEvent({
        delay: motion === 'run' ? 130 : 200,
        loop: true,
        callback: () => {
          if (!this.active) return;
          i ^= 1;
          this.applyTexture(cycle[i]);
        },
      });
      return;
    }

    this.applyTexture(this.texFor(motion));

    if (motion === 'idle' || motion === 'dance') {
      this.idleTween = this.scene.tweens.add({
        targets: this.sprite,
        y: motion === 'dance' ? -8 : -4,
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
  const bubble = scene.add
    .text(x, y, text, {
      fontFamily: FONT,
      fontSize: '30px',
      color: '#1a1a2e',
      backgroundColor: '#f5f5f5',
      padding: { x: 20, y: 12 },
      align: 'center',
    })
    .setOrigin(0.5, 1)
    .setDepth(depth);
  scene.tweens.add({
    targets: bubble,
    y: y - 20,
    duration: durationMs,
    onComplete: () => bubble.destroy(),
  });
  scene.time.delayedCall(durationMs, () => bubble.destroy());
}
