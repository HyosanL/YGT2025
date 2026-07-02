import Phaser from 'phaser';
import { FONT } from '../config';

export type CadetKind = 'player' | 'junior' | 'senior';

const STYLE: Record<CadetKind, { body: number; head: number; scale: number; face: string; label: string }> = {
  player: { body: 0x3a6ea5, head: 0xffd9b3, scale: 1.0, face: '😏', label: '기태 (2학년)' },
  junior: { body: 0x4ecca3, head: 0xffe0c2, scale: 0.85, face: '😳', label: '후배 (1학년)' },
  senior: { body: 0x8b1e3f, head: 0xffd0a8, scale: 1.2, face: '😠', label: '선배' },
};

/**
 * 실루엣/색상으로 즉시 구분되는 간단 캐릭터 (도형 + 이모지).
 * 이후 스탠딩 일러스트 텍스처로 교체 가능하도록 컨테이너 단위로 취급.
 */
export class Cadet extends Phaser.GameObjects.Container {
  private faceText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: CadetKind, showLabel = false) {
    super(scene, x, y);
    const s = STYLE[kind];

    const g = scene.add.graphics();
    // 몸통 (제복 느낌의 라운드 사각형)
    g.fillStyle(s.body, 1);
    g.fillRoundedRect(-55 * s.scale, -60 * s.scale, 110 * s.scale, 160 * s.scale, 24 * s.scale);
    // 견장
    g.fillStyle(0xffd700, 1);
    g.fillRect(-55 * s.scale, -56 * s.scale, 24 * s.scale, 10 * s.scale);
    g.fillRect(31 * s.scale, -56 * s.scale, 24 * s.scale, 10 * s.scale);
    // 머리
    g.fillStyle(s.head, 1);
    g.fillCircle(0, -105 * s.scale, 42 * s.scale);
    // 정모 (선배는 챙 큰 모자)
    g.fillStyle(kind === 'senior' ? 0x2b2b2b : 0x1f3b5c, 1);
    g.fillRoundedRect(-46 * s.scale, -152 * s.scale, 92 * s.scale, 26 * s.scale, 8 * s.scale);
    if (kind === 'senior') {
      g.fillRect(-56 * s.scale, -132 * s.scale, 112 * s.scale, 8 * s.scale);
    }
    this.add(g);

    this.faceText = scene.add
      .text(0, -102 * s.scale, s.face, { fontFamily: FONT, fontSize: `${40 * s.scale}px` })
      .setOrigin(0.5);
    this.add(this.faceText);

    if (showLabel) {
      const label = scene.add
        .text(0, 120 * s.scale, s.label, {
          fontFamily: FONT,
          fontSize: '24px',
          color: '#a8b2d1',
        })
        .setOrigin(0.5);
      this.add(label);
    }

    scene.add.existing(this);
  }

  setFace(emoji: string): void {
    this.faceText.setText(emoji);
  }
}

/** 말풍선 (잠깐 표시 후 자동 소멸) */
export function speechBubble(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  durationMs = 1200
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
    .setDepth(800);
  scene.tweens.add({
    targets: bubble,
    y: y - 20,
    duration: durationMs,
    onComplete: () => bubble.destroy(),
  });
  scene.time.delayedCall(durationMs, () => bubble.destroy());
}
