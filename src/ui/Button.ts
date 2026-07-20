import Phaser from 'phaser';
import { COLORS, FONT, GAME_WIDTH, UI } from '../config';
import { audio } from '../core/AudioManager';

export interface ButtonOptions {
  label: string;
  width?: number;
  height?: number;
  color?: number;
  fontSize?: number;
  /** 글자색 (기본: 흰색) — 밝은 배경 버튼용 */
  labelColor?: string;
  /** 테두리 색 (기본: 흰색 반투명) */
  strokeColor?: number;
  /** 라벨 줄바꿈 폭 (px) — 긴 문장 선지 버튼용 */
  wrapWidth?: number;
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

    // 라벨은 검정 — 밝은 플랫 버튼 위에서 가장 또렷하다 (외곽선 없이 깔끔하게)
    this.labelText = scene.add
      .text(0, 0, opts.label, {
        fontFamily: FONT,
        fontSize: `${opts.fontSize ?? 32}px`,
        color: opts.labelColor ?? COLORS.inkCss,
        align: 'center',
        ...(opts.wrapWidth ? { wordWrap: { width: opts.wrapWidth } } : {}),
      })
      .setOrigin(0.5);
    this.add(this.labelText);

    this.setSize(this.btnW, this.btnH);
    // 주의: setSize된 컨테이너는 히트테스트 시 displayOrigin(w/2, h/2)이 로컬 좌표에
    // 더해지므로, 히트영역은 (0,0) 기준으로 잡아야 버튼 전체가 눌린다.
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, this.btnW, this.btnH),
      Phaser.Geom.Rectangle.Contains
    );

    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.pressed = true;
      // 그림자가 있던 자리로 내려앉는다 — 실제 블록을 누른 듯한 타격감
      this.drawBg(this.color, true);
      this.labelText.setY(UI.btnLift);
      opts.onDown?.();
    });
    const release = (fireClick: boolean): void => {
      if (!this.pressed) return;
      this.pressed = false;
      this.drawBg(this.color, false);
      this.labelText.setY(0);
      opts.onUp?.();
      if (fireClick && this.enabled && opts.onClick) {
        audio.tick();
        opts.onClick();
      }
    };
    this.on('pointerup', () => release(true));
    this.on('pointerout', () => release(false));
    // 씬이 pause되면 pointerup이 유실되어 홀드가 고착된다 — pause 시점에 강제 해제
    const onScenePause = (): void => release(false);
    scene.events.on(Phaser.Scenes.Events.PAUSE, onScenePause);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.PAUSE, onScenePause);
    });

    scene.add.existing(this);
  }

  /**
   * 단색 + 굵은 검정 외곽선 + 블러 없는 아래쪽 하드 섀도.
   * 눌리면 버튼이 섀도 두께만큼 내려앉고 섀도가 사라진다.
   */
  private drawBg(color: number, pressed = false): void {
    const w = this.btnW, h = this.btnH, r = UI.btnRadius;
    const dy = pressed ? UI.btnLift : 0;
    this.bg.clear();
    if (!pressed) {
      this.bg.fillStyle(COLORS.ink, 1);
      this.bg.fillRoundedRect(-w / 2, -h / 2 + UI.btnLift, w, h, r);
    }
    this.bg.fillStyle(color, 1);
    this.bg.fillRoundedRect(-w / 2, -h / 2 + dy, w, h, r);
    this.bg.lineStyle(UI.stroke, COLORS.ink, 1);
    this.bg.strokeRoundedRect(-w / 2, -h / 2 + dy, w, h, r);
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
    this.drawBg(color, this.pressed);
    return this;
  }
}

/**
 * 화면 위에 얹는 흰 패널/칩 — 반투명 검정 박스를 대체한다.
 * 단색 흰 바탕 + 굵은 검정 외곽선 + 하드 섀도.
 */
export function drawPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number = COLORS.white,
  radius: number = UI.radius
): void {
  g.fillStyle(COLORS.ink, 1);
  g.fillRoundedRect(x + UI.shadow, y + UI.shadow, w, h, radius);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(UI.stroke, COLORS.ink, 1);
  g.strokeRoundedRect(x, y, w, h, radius);
}

export interface ChipOptions {
  fontSize?: number;
  /** 글자색 — 기본은 검정. 밝은 칩 위에 흰 글씨를 얹지 않도록 주의 */
  color?: string;
  fill?: number;
  padX?: number;
  padY?: number;
  align?: string;
  wrapWidth?: number;
  lineSpacing?: number;
}

/**
 * 배경 그림 위에 얹는 텍스트 칩 — 흰 패널 + 굵은 검정 외곽선 + 하드 섀도.
 * (Text의 반투명 검정 backgroundColor는 플랫 아트와 안 어울려 전부 이걸로 바꿨다)
 *
 * 패널과 글자를 한 컨테이너로 묶는다 — 따로 두면 setVisible(false)가 글자만 숨기고
 * 빈 패널이 화면에 남는다.
 */
export class TextChip extends Phaser.GameObjects.Container {
  private label: Phaser.GameObjects.Text;
  private panel: Phaser.GameObjects.Graphics;
  private opts: ChipOptions;

  constructor(scene: Phaser.Scene, x: number, y: number, message: string, opts: ChipOptions = {}) {
    super(scene, x, y);
    this.opts = opts;
    this.panel = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, message, {
        fontFamily: FONT,
        fontSize: `${opts.fontSize ?? 30}px`,
        color: opts.color ?? COLORS.inkCss,
        align: opts.align ?? 'center',
        lineSpacing: opts.lineSpacing ?? 6,
        ...(opts.wrapWidth ? { wordWrap: { width: opts.wrapWidth } } : {}),
      })
      .setOrigin(0.5);
    this.add([this.panel, this.label]);
    this.redraw();
    scene.add.existing(this);
  }

  private redraw(): void {
    const padX = this.opts.padX ?? 22;
    const padY = this.opts.padY ?? 12;
    this.panel.clear();
    drawPanel(
      this.panel,
      -this.label.width / 2 - padX,
      -this.label.height / 2 - padY,
      this.label.width + padX * 2,
      this.label.height + padY * 2,
      this.opts.fill ?? COLORS.white
    );
  }

  setText(value: string): this {
    this.label.setText(value);
    this.redraw();
    return this;
  }

  setTextColor(color: string): this {
    this.label.setColor(color);
    return this;
  }
}

export function textChip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  message: string,
  opts: ChipOptions & { depth?: number } = {}
): TextChip {
  return new TextChip(scene, x, y, message, opts).setDepth(opts.depth ?? 10) as TextChip;
}

/**
 * 화면 중앙 하단에 팝 하고 튀어나오는 토스트 — 노란 알약 + 검정 외곽선.
 * 살짝 삐뚤게 얹고, 사라질 땐 페이드 대신 위로 떠오르며 줄어든다 (플랫 아트에 맞춰).
 */
export function showToast(scene: Phaser.Scene, message: string, color: string = COLORS.inkCss): void {
  const box = scene.add.container(GAME_WIDTH / 2, 900).setDepth(1500);
  const label = scene.add
    .text(0, 0, message, { fontFamily: FONT, fontSize: '32px', color, align: 'center' })
    .setOrigin(0.5);
  const g = scene.add.graphics();
  const w = label.width + 52;
  const h = label.height + 30;
  drawPanel(g, -w / 2, -h / 2, w, h, COLORS.warn, h / 2);
  box.add([g, label]);
  box.setScale(0).setAngle(Phaser.Math.Between(-5, 5));

  scene.tweens.chain({
    targets: box,
    tweens: [
      { scale: 1.15, duration: 130, ease: 'Cubic.easeOut' },
      { scale: 1, duration: 90 },
      { y: 850, scale: 0, delay: 900, duration: 260, ease: 'Back.easeIn' },
    ],
    onComplete: () => box.destroy(),
  });
}
