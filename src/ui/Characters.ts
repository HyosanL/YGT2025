import Phaser from 'phaser';
import { FONT } from '../config';

export type CadetKind = 'player' | 'junior' | 'senior';
export type CadetMotion = 'idle' | 'walk' | 'run' | 'dance' | 'salute';

interface CadetStyle {
  uniform: number;
  uniformDark: number;
  trousers: number;
  shoe: number;
  cap: number;
  capBand: number;
  skin: number;
  hair: number;
  /** 학년 — 견장의 금색 막대 수로 표시 */
  rank: number;
  scale: number;
  face: string;
  label: string;
}

const STYLE: Record<CadetKind, CadetStyle> = {
  player: {
    uniform: 0x3a6ea5,
    uniformDark: 0x2b5680,
    trousers: 0x24384f,
    shoe: 0x14141c,
    cap: 0x1f3b5c,
    capBand: 0xffd700,
    skin: 0xffd9b3,
    hair: 0x2a2018,
    rank: 2,
    scale: 1.0,
    face: '😏',
    label: '기태 (2학년)',
  },
  junior: {
    uniform: 0x4ecca3,
    uniformDark: 0x379e7d,
    trousers: 0x27594a,
    shoe: 0x14141c,
    cap: 0x2e6e58,
    capBand: 0xd9f2e6,
    skin: 0xffe0c2,
    hair: 0x2a2018,
    rank: 1,
    scale: 0.85,
    face: '😳',
    label: '후배 (1학년)',
  },
  senior: {
    uniform: 0x8b1e3f,
    uniformDark: 0x6e1631,
    trousers: 0x33101e,
    shoe: 0x0d0d12,
    cap: 0x232328,
    capBand: 0xe94560,
    skin: 0xffd0a8,
    hair: 0x1c1712,
    rank: 3,
    scale: 1.2,
    face: '😠',
    label: '선배 (3학년)',
  },
};

/** 모션별 스윙 파라미터 — halfMs는 반 주기, 각도는 라디안 */
const MOTION_PARAMS = {
  walk: { halfMs: 240, leg: 0.3, arm: 0.38, bob: 3, lean: 0 },
  run: { halfMs: 130, leg: 0.62, arm: 0.85, bob: 7, lean: 5 },
  dance: { halfMs: 300, leg: 0.05, arm: 0.28, bob: 2, lean: 4 },
} as const;

/**
 * 팔/다리가 분리된 리그 구조의 생도 캐릭터 (도형 + 이모지 얼굴).
 * setMotion으로 걷기/뛰기/춤/경례 등 동작 전환, 학년은 견장 막대 수로 구분.
 * 컨테이너 좌표(x/y/scale)는 씬이 제어하고, 동작 연출은 내부 rig에만 적용된다.
 */
export class Cadet extends Phaser.GameObjects.Container {
  private faceText: Phaser.GameObjects.Text;
  private rig: Phaser.GameObjects.Container;
  private leftArm: Phaser.GameObjects.Container;
  private rightArm: Phaser.GameObjects.Container;
  private leftLeg: Phaser.GameObjects.Container;
  private rightLeg: Phaser.GameObjects.Container;
  private motion: CadetMotion | null = null;
  private phaseTween: Phaser.Tweens.Tween | null = null;
  private style: CadetStyle;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: CadetKind, showLabel = false) {
    super(scene, x, y);
    const st = STYLE[kind];
    this.style = st;
    const s = st.scale;
    const u = (n: number): number => n * s;

    // 그림자 — 바닥에 고정 (rig의 바운스에 따라 움직이지 않도록 밖에 둠)
    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.22);
    shadow.fillEllipse(0, u(102), u(100), u(20));
    this.add(shadow);

    this.rig = scene.add.container(0, 0);
    this.add(this.rig);

    // 다리 (골반 피벗)
    this.leftLeg = this.buildLeg(scene, u(-22), s);
    this.rightLeg = this.buildLeg(scene, u(22), s);
    this.rig.add(this.leftLeg);
    this.rig.add(this.rightLeg);

    // 몸통 (제복 상의)
    const torso = scene.add.graphics();
    // 목
    torso.fillStyle(st.skin, 1);
    torso.fillRect(u(-10), u(-76), u(20), u(18));
    // 상의
    torso.fillStyle(st.uniform, 1);
    torso.fillRoundedRect(u(-52), u(-62), u(104), u(96), u(16));
    // 앞섶 라인
    torso.lineStyle(u(2.5), st.uniformDark, 1);
    torso.lineBetween(0, u(-58), 0, u(28));
    // 단추
    torso.fillStyle(0xffd700, 1);
    for (const by of [-38, -14, 10]) torso.fillCircle(0, u(by), u(4.5));
    // 칼라
    torso.fillStyle(st.uniformDark, 1);
    torso.fillTriangle(u(-20), u(-62), u(-2), u(-62), u(-14), u(-46));
    torso.fillTriangle(u(20), u(-62), u(2), u(-62), u(14), u(-46));
    // 왼가슴 주머니
    torso.lineStyle(u(2), st.uniformDark, 0.9);
    torso.strokeRoundedRect(u(-42), u(-32), u(24), u(18), u(4));
    // 오른가슴 명찰
    torso.fillStyle(0xf5f5f5, 1);
    torso.fillRect(u(18), u(-30), u(24), u(9));
    // 허리띠 + 버클
    torso.fillStyle(0x20202c, 1);
    torso.fillRect(u(-52), u(18), u(104), u(13));
    torso.fillStyle(0xffd700, 1);
    torso.fillRect(u(-8), u(18), u(16), u(13));
    // 견장 + 학년 계급장 (막대 수 = 학년)
    torso.fillStyle(st.uniformDark, 1);
    torso.fillRoundedRect(u(-52), u(-64), u(30), u(11), u(4));
    torso.fillRoundedRect(u(22), u(-64), u(30), u(11), u(4));
    torso.fillStyle(0xffd700, 1);
    for (let i = 0; i < st.rank; i++) {
      torso.fillRect(u(-48 + i * 8), u(-62), u(5), u(7));
      torso.fillRect(u(26 + i * 8), u(-62), u(5), u(7));
    }
    // 애니풍 셀셰이딩 (오른쪽 음영) + 라인아트 외곽선
    torso.fillStyle(0x000000, 0.08);
    torso.fillRoundedRect(u(12), u(-62), u(40), u(96), u(16));
    torso.lineStyle(u(2.5), 0x1b2233, 0.55);
    torso.strokeRoundedRect(u(-52), u(-62), u(104), u(96), u(16));
    this.rig.add(torso);

    // 팔 (어깨 피벗) — 선배는 왼팔에 완장
    this.leftArm = this.buildArm(scene, u(-50), s, kind === 'senior');
    this.rightArm = this.buildArm(scene, u(50), s, false);
    this.rig.add(this.leftArm);
    this.rig.add(this.rightArm);

    // 머리 + 정모
    const head = scene.add.container(0, u(-104));
    const hg = scene.add.graphics();
    hg.fillStyle(st.skin, 1);
    hg.fillCircle(u(-38), u(4), u(9));
    hg.fillCircle(u(38), u(4), u(9));
    hg.fillCircle(0, 0, u(40));
    hg.lineStyle(u(2.5), 0x1b2233, 0.5);
    hg.strokeCircle(0, 0, u(40));
    // 앞머리
    hg.fillStyle(st.hair, 1);
    hg.fillRect(u(-38), u(-32), u(76), u(10));
    // 정모 (선배는 크라운도 챙도 크다)
    const big = kind === 'senior';
    hg.fillStyle(st.cap, 1);
    if (big) hg.fillRoundedRect(u(-48), u(-64), u(96), u(34), u(12));
    else hg.fillRoundedRect(u(-44), u(-60), u(88), u(30), u(10));
    hg.fillStyle(st.capBand, 1);
    hg.fillRect(u(big ? -48 : -44), u(-36), u(big ? 96 : 88), u(6));
    hg.fillStyle(0x101016, 1);
    if (big) hg.fillRoundedRect(u(-52), u(-30), u(104), u(9), u(4));
    else hg.fillRoundedRect(u(-36), u(-30), u(72), u(7), u(3));
    // 정모 크라운 하이라이트
    hg.fillStyle(0xffffff, 0.15);
    hg.fillEllipse(u(-14), u(big ? -54 : -50), u(34), u(9));
    // 모표 (금색 날개)
    hg.fillStyle(0xffd700, 1);
    hg.fillCircle(0, u(-46), u(5));
    hg.fillTriangle(u(-11), u(-44), u(-3), u(-49), u(-3), u(-41));
    hg.fillTriangle(u(11), u(-44), u(3), u(-49), u(3), u(-41));
    head.add(hg);

    this.faceText = scene.add
      .text(0, u(6), st.face, { fontFamily: FONT, fontSize: `${34 * s}px` })
      .setOrigin(0.5);
    head.add(this.faceText);
    this.rig.add(head);

    if (showLabel) {
      const label = scene.add
        .text(0, u(124), st.label, {
          fontFamily: FONT,
          fontSize: '24px',
          color: '#a8b2d1',
        })
        .setOrigin(0.5);
      this.add(label);
    }

    scene.add.existing(this);
    this.setMotion('idle');
  }

  private buildLeg(scene: Phaser.Scene, x: number, s: number): Phaser.GameObjects.Container {
    const u = (n: number): number => n * s;
    const leg = scene.add.container(x, u(28));
    const g = scene.add.graphics();
    g.fillStyle(this.style.trousers, 1);
    g.fillRoundedRect(u(-13), u(-8), u(26), u(64), u(7));
    g.lineStyle(u(2.2), 0x1b2233, 0.5);
    g.strokeRoundedRect(u(-13), u(-8), u(26), u(64), u(7));
    g.fillStyle(this.style.shoe, 1);
    g.fillRoundedRect(u(-15), u(52), u(32), u(18), u(6));
    g.fillStyle(0xffffff, 0.18);
    g.fillEllipse(u(-2), u(58), u(20), u(5));
    leg.add(g);
    return leg;
  }

  private buildArm(
    scene: Phaser.Scene,
    x: number,
    s: number,
    armband: boolean
  ): Phaser.GameObjects.Container {
    const u = (n: number): number => n * s;
    const arm = scene.add.container(x, u(-46));
    const g = scene.add.graphics();
    g.fillStyle(this.style.uniform, 1);
    g.fillRoundedRect(u(-11), u(-8), u(22), u(62), u(9));
    g.lineStyle(u(2.2), 0x1b2233, 0.5);
    g.strokeRoundedRect(u(-11), u(-8), u(22), u(62), u(9));
    if (armband) {
      g.fillStyle(0xe94560, 1);
      g.fillRect(u(-11), u(8), u(22), u(14));
      g.fillStyle(0xf5f5f5, 1);
      g.fillRect(u(-11), u(13), u(22), u(3));
    }
    g.fillStyle(this.style.uniformDark, 1);
    g.fillRect(u(-11), u(42), u(22), u(8));
    g.fillStyle(this.style.skin, 1);
    g.fillCircle(0, u(58), u(10));
    arm.add(g);
    return arm;
  }

  setFace(emoji: string): void {
    this.faceText.setText(emoji);
  }

  /**
   * 동작 전환. 같은 모션이면 no-op이라 tick에서 매 프레임 호출해도 안전하다.
   * - idle: 숨쉬기 수준의 미세한 바운스
   * - walk/run: 팔다리 스윙 + 바운스 (run은 몸을 앞으로 기울인다)
   * - dance: 팔 벌리고 좌우로 들썩들썩
   * - salute: 오른손(화면 왼팔) 거수경례
   */
  setMotion(motion: CadetMotion): void {
    if (!this.active || this.motion === motion) return;
    this.motion = motion;
    this.phaseTween?.remove();
    this.phaseTween = null;
    this.scene.tweens.killTweensOf(this.leftArm);
    this.scene.tweens.killTweensOf(this.rightArm);
    this.scene.tweens.killTweensOf(this.rig);
    this.rig.setPosition(0, 0).setAngle(0);
    this.leftArm.rotation = 0;
    this.rightArm.rotation = 0;
    this.leftLeg.rotation = 0;
    this.rightLeg.rotation = 0;

    if (motion === 'idle') {
      this.phaseTween = this.scene.tweens.add({
        targets: this.rig,
        y: 2 * this.style.scale,
        duration: 750,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      return;
    }

    if (motion === 'salute') {
      this.phaseTween = this.scene.tweens.add({
        targets: this.leftArm,
        rotation: -2.5,
        duration: 130,
        ease: 'Back.easeOut',
      });
      return;
    }

    const p = MOTION_PARAMS[motion];
    const phase = { v: -1 };
    this.phaseTween = this.scene.tweens.add({
      targets: phase,
      v: 1,
      duration: p.halfMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        if (!this.active) return;
        const v = phase.v;
        this.leftLeg.rotation = v * p.leg;
        this.rightLeg.rotation = -v * p.leg;
        if (motion === 'dance') {
          this.leftArm.rotation = 0.8 + v * p.arm;
          this.rightArm.rotation = -0.8 + v * p.arm;
          this.rig.angle = v * p.lean;
        } else {
          this.leftArm.rotation = -v * p.arm;
          this.rightArm.rotation = v * p.arm;
          this.rig.angle = p.lean;
        }
        this.rig.y = -(1 - v * v) * p.bob * this.style.scale;
      },
    });
  }

  /** 거수경례 후 원래 동작으로 복귀 */
  saluteOnce(holdMs = 800): void {
    if (!this.active) return;
    const prev = this.motion ?? 'idle';
    this.setMotion('salute');
    this.scene.time.delayedCall(holdMs, () => {
      if (this.active && this.motion === 'salute') {
        this.setMotion(prev === 'salute' ? 'idle' : prev);
      }
    });
  }

  /** 벽치기 등 한 방 펀치 연출 (idle 상태에서 사용) */
  punchOnce(dir: 'left' | 'right'): void {
    if (!this.active) return;
    const arm = dir === 'left' ? this.leftArm : this.rightArm;
    this.scene.tweens.add({
      targets: arm,
      rotation: dir === 'left' ? 1.7 : -1.7,
      duration: 80,
      yoyo: true,
      ease: 'Cubic.easeOut',
    });
    this.scene.tweens.add({
      targets: this.rig,
      x: (dir === 'left' ? -12 : 12) * this.style.scale,
      duration: 80,
      yoyo: true,
    });
  }

  destroy(fromScene?: boolean): void {
    if (!fromScene) this.phaseTween?.remove();
    this.phaseTween = null;
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
