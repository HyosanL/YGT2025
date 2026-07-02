import Phaser from 'phaser';
import { COLORS, FONT } from '../config';
import { audio } from '../core/AudioManager';
import { gameState } from '../core/GameState';

export interface ButtonOptions {
  label: string;
  width?: number;
  height?: number;
  color?: number;
  fontSize?: number;
  onClick?: () => void;
  /** 홀드형 버튼용 (누르는 동안/떼는 순간) */
  onDown?: () => void;
  onUp?: () => void;
}

/**
 * 모바일 우선 터치 버튼 — 최소 터치 타깃 88px.
 */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private labelText: Phaser.GameObjects.Text;
  private btnW: number;
  private btnH: number;
  private color: number;
  private enabled = true;
  private pressed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ButtonOptions) {
    super(scene, x, y);
    this.btnW = Math.max(88, opts.width ?? 280);
    this.btnH = Math.max(88, opts.height ?? 96);
    this.color = opts.color ?? COLORS.panelLight;

    this.bg = scene.add.graphics();
    this.drawBg(this.color);
    this.add(this.bg);

    this.labelText = scene.add
      .text(0, 0, opts.label, {
        fontFamily: FONT,
        fontSize: `${opts.fontSize ?? 32}px`,
        color: COLORS.textCss,
        align: 'center',
      })
      .setOrigin(0.5);
    this.add(this.labelText);

    this.setSize(this.btnW, this.btnH);
    this.setInteractive(
      new Phaser.Geom.Rectangle(-this.btnW / 2, -this.btnH / 2, this.btnW, this.btnH),
      Phaser.Geom.Rectangle.Contains
    );

    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.pressed = true;
      this.setScale(0.95);
      opts.onDown?.();
    });
    const release = (fireClick: boolean): void => {
      if (!this.pressed) return;
      this.pressed = false;
      this.setScale(1);
      opts.onUp?.();
      if (fireClick && this.enabled && opts.onClick) {
        audio.tick();
        opts.onClick();
      }
    };
    this.on('pointerup', () => release(true));
    this.on('pointerout', () => release(false));

    scene.add.existing(this);
  }

  private drawBg(color: number): void {
    this.bg.clear();
    this.bg.fillStyle(color, 1);
    this.bg.fillRoundedRect(-this.btnW / 2, -this.btnH / 2, this.btnW, this.btnH, 20);
    this.bg.lineStyle(3, COLORS.white, 0.25);
    this.bg.strokeRoundedRect(-this.btnW / 2, -this.btnH / 2, this.btnW, this.btnH, 20);
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.4);
    return this;
  }

  setLabel(label: string): this {
    this.labelText.setText(label);
    return this;
  }

  setColor(color: number): this {
    this.color = color;
    this.drawBg(color);
    return this;
  }
}

/** 우상단 음소거 토글 버튼 (모든 씬 공통) */
export function addMuteButton(scene: Phaser.Scene): Phaser.GameObjects.Text {
  const label = (): string => (gameState.settings.mute ? '🔇' : '🔊');
  const btn = scene.add
    .text(720 - 24, 24, label(), { fontFamily: FONT, fontSize: '44px' })
    .setOrigin(1, 0)
    .setDepth(1000)
    .setInteractive({ useHandCursor: true });
  btn.on('pointerdown', () => {
    const mute = !gameState.settings.mute;
    gameState.setMute(mute);
    audio.setMute(mute);
    btn.setText(label());
  });
  return btn;
}

/** 화면 중앙 하단에 잠깐 떠오르는 토스트 텍스트 */
export function showToast(scene: Phaser.Scene, message: string, color: string = COLORS.textCss): void {
  const toast = scene.add
    .text(360, 900, message, {
      fontFamily: FONT,
      fontSize: '34px',
      color,
      backgroundColor: 'rgba(0,0,0,0.65)',
      padding: { x: 24, y: 14 },
      align: 'center',
    })
    .setOrigin(0.5)
    .setDepth(1500);
  scene.tweens.add({
    targets: toast,
    y: 840,
    alpha: { from: 1, to: 0 },
    duration: 1400,
    ease: 'Cubic.easeOut',
    onComplete: () => toast.destroy(),
  });
}
