import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, MINI } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import type { MiniSceneData } from '../../types';

export const PANEL = { x: 40, y: 150, w: GAME_WIDTH - 80, h: 980 } as const;

/**
 * 미니 퀘스트 공통 베이스 (메인 씬 pause 위에 오버레이로 launch됨).
 * - 반투명 백드롭 + 패널
 * - 카운트다운 타이머 (붉은 펄스 압박 연출 포함)
 * - 성공 → 메인 씬 resume / 실패 → 즉시 게임 오버 (config로 HP 페널티 전환 가능)
 */
export abstract class BaseMiniScene extends Phaser.Scene {
  protected returnTo = '';
  protected done = false;

  private timerTotal = 0;
  private timerRemaining = 0;
  private timerActive = false;
  private onExpire: (() => void) | null = null;
  private timerFill: Phaser.GameObjects.Graphics | null = null;
  private timerText: Phaser.GameObjects.Text | null = null;
  private panicOverlay: Phaser.GameObjects.Rectangle | null = null;
  private lastSecond = -1;
  private pulseMs = 0;

  init(data: MiniSceneData): void {
    this.returnTo = data.returnTo;
  }

  /** 백드롭 + 패널 + 타이틀 생성. create() 첫 줄에서 호출할 것 */
  protected setupOverlay(title: string): void {
    this.done = false;
    this.timerActive = false;
    this.timerFill = null;
    this.timerText = null;
    this.lastSecond = -1;
    this.pulseMs = 0;

    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75)
      .setOrigin(0)
      .setInteractive(); // 하위 씬으로의 입력 차단
    void dim;

    const panel = this.add.graphics();
    panel.fillStyle(COLORS.panel, 0.98);
    panel.fillRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 24);
    panel.lineStyle(3, COLORS.warn, 0.6);
    panel.strokeRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 24);

    this.add
      .text(GAME_WIDTH / 2, PANEL.y + 50, title, {
        fontFamily: FONT,
        fontSize: '38px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.panicOverlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xe94560, 0)
      .setOrigin(0)
      .setDepth(500);
  }

  /** 카운트다운 시작 — 패널 상단에 바 + 큰 숫자 */
  protected startTimer(totalMs: number, onExpire: () => void): void {
    this.timerTotal = totalMs;
    this.timerRemaining = totalMs;
    this.timerActive = true;
    this.onExpire = onExpire;

    if (!this.timerFill) {
      const barBg = this.add.graphics();
      barBg.fillStyle(0x000000, 0.5);
      barBg.fillRoundedRect(PANEL.x + 30, PANEL.y + 90, PANEL.w - 160, 30, 8);
      this.timerFill = this.add.graphics();
      this.timerText = this.add
        .text(PANEL.x + PANEL.w - 65, PANEL.y + 105, '', {
          fontFamily: FONT,
          fontSize: '56px',
          color: COLORS.textCss,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
    }
  }

  protected stopTimer(): void {
    this.timerActive = false;
  }

  update(_time: number, delta: number): void {
    if (!this.timerActive || this.done) return;
    // delta 누적 방식 — this.time.now(절대 시계)는 이 씬이 재사용되는 launch 사이
    // 정지해 있던 실제 경과 시간을 그대로 반영해버려, 재진입 시 이미 만료된
    // 값으로 계산되는 버그가 있었다. 프레임 delta만 소비해야 안전하다.
    this.pulseMs += delta;
    this.timerRemaining = Math.max(0, this.timerRemaining - delta);
    const remain = this.timerRemaining;
    const ratio = remain / this.timerTotal;
    const panic = remain < Math.min(3000, this.timerTotal * 0.45);

    if (this.timerFill) {
      this.timerFill.clear();
      this.timerFill.fillStyle(panic ? COLORS.accent : COLORS.safe, 1);
      this.timerFill.fillRoundedRect(PANEL.x + 36, PANEL.y + 96, (PANEL.w - 172) * ratio, 18, 6);
    }
    const sec = Math.ceil(remain / 1000);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      audio.tick();
    }
    this.timerText?.setText(`${sec}`).setColor(panic ? COLORS.accentCss : COLORS.textCss);
    if (this.panicOverlay) {
      this.panicOverlay.setFillStyle(
        0xe94560,
        panic ? 0.06 + 0.06 * (1 + Math.sin(this.pulseMs / 90)) : 0
      );
    }

    if (remain <= 0) {
      this.timerActive = false;
      this.onExpire?.();
    }
  }

  protected finishSuccess(message = '위기를 넘겼다!'): void {
    if (this.done) return;
    this.done = true;
    this.stopTimer();
    audio.chime();
    const text = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, `✅ ${message}`, {
        fontFamily: FONT,
        fontSize: '42px',
        color: COLORS.safeCss,
        fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: { x: 30, y: 20 },
      })
      .setOrigin(0.5)
      .setDepth(600);
    void text;
    this.time.delayedCall(700, () => this.returnWithCountdown());
  }

  /**
   * 곧바로 본 게임으로 던지지 않고 짧은 카운트다운(2→1→GO)으로
   * 손가락과 시선을 재정비할 시간을 준 뒤 resume한다.
   */
  private returnWithCountdown(): void {
    this.scene.launch('Pause', {
      returnTo: this.returnTo,
      mode: 'countdown',
      count: 2,
      label: '본 임무로 복귀!',
    });
    this.scene.stop();
  }

  protected finishFail(reason: string): void {
    if (this.done) return;
    this.done = true;
    this.stopTimer();

    if (MINI.failMode === 'gameover') {
      audio.caught();
      audio.gameover();
      this.cameras.main.shake(400, 0.01);
      this.cameras.main.flash(400, 233, 69, 96);
      this.time.delayedCall(1100, () => {
        this.scene.stop(this.returnTo);
        this.scene.start('Result', { success: false, reason });
      });
    } else {
      gameState.damage(MINI.failHpPenalty);
      audio.buzz();
      this.time.delayedCall(700, () => this.returnWithCountdown());
    }
  }
}
