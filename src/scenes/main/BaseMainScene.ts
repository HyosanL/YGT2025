import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import { questManager } from '../../core/QuestManager';
import { addMuteButton, showToast } from '../../ui/Button';
import { HpBar } from '../../ui/HpBar';

export interface SeniorLoopParams {
  gapMs: number;
  stayMs: number;
}

export interface SeniorLoopHandlers {
  /** 매 사이클마다 호출 — 일차별 난이도가 반영된 타이밍 반환 */
  params: () => SeniorLoopParams;
  /** 선배가 예고 없이 등장하는 순간 — 여기서부터 반응속도 승부가 시작된다 */
  onEnter: () => void;
  onLeave: () => void;
}

/**
 * 메인 퀘스트 공통 베이스:
 * - HP 바 / 음소거 버튼
 * - 미니 퀘스트 인터럽트 (pause → 오버레이 launch → resume)
 * - 선배 등장 루프 스케줄러 (예고 없이 등장 → 체류 → 퇴장 반복, 등장 순간의 반응속도가 핵심)
 * - 성공/실패/데미지 공통 처리
 */
export abstract class BaseMainScene extends Phaser.Scene {
  protected hpBar!: HpBar;
  protected finished = false;
  protected day = 1;
  private miniActive = false;
  private dangerG!: Phaser.GameObjects.Graphics;
  private dangerTween: Phaser.Tweens.Tween | null = null;

  /** 서브클래스 create()에서 배경을 그린 뒤 호출 */
  protected setupCommon(): void {
    this.finished = false;
    this.miniActive = false;
    this.day = gameState.day;
    this.hpBar = new HpBar(this);
    addMuteButton(this);
    this.createDangerVignette();
    this.scheduleMiniQuests();

    this.events.on(Phaser.Scenes.Events.RESUME, this.onResumeFromMini, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.RESUME, this.onResumeFromMini, this);
      audio.stopAll();
    });
  }

  // ── 위험 비네트 (선배가 갑자기 등장하면 화면 가장자리가 붉게 고동친다) ──

  private createDangerVignette(): void {
    const edge = 60;
    this.dangerG = this.add.graphics().setDepth(2500);
    this.dangerG.fillStyle(COLORS.accent, 1);
    this.dangerG.fillRect(0, 0, GAME_WIDTH, edge);
    this.dangerG.fillRect(0, GAME_HEIGHT - edge, GAME_WIDTH, edge);
    this.dangerG.fillRect(0, edge, edge, GAME_HEIGHT - edge * 2);
    this.dangerG.fillRect(GAME_WIDTH - edge, edge, edge, GAME_HEIGHT - edge * 2);
    this.dangerG.setAlpha(0);
    this.dangerTween = null;
  }

  protected setDanger(level: 'off' | 'in'): void {
    this.dangerTween?.remove();
    this.dangerTween = null;
    if (level === 'off') {
      this.dangerG.setAlpha(0);
      return;
    }
    this.dangerTween = this.tweens.add({
      targets: this.dangerG,
      alpha: { from: 0.26, to: 0.42 },
      duration: 260,
      yoyo: true,
      repeat: -1,
    });
  }

  update(_time: number, delta: number): void {
    if (!this.finished) {
      this.hpBar.setHp(gameState.hp);
      this.tick(delta);
    }
  }

  /** 서브클래스별 프레임 로직 */
  protected abstract tick(delta: number): void;

  // ── 미니 퀘스트 인터럽트 ──────────────────────

  private scheduleMiniQuests(): void {
    const delays = questManager.planMiniTriggers(this.day);
    for (const delay of delays) {
      this.time.delayedCall(delay, () => this.triggerMini());
    }
  }

  private triggerMini(): void {
    if (this.finished || this.miniActive) return;
    this.miniActive = true;
    audio.ding();

    // 상단에서 "띠링" 알림 배너가 내려오는 연출
    const banner = this.add.container(GAME_WIDTH / 2, -70).setDepth(3000);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.9);
    g.fillRoundedRect(-300, -46, 600, 92, 18);
    g.lineStyle(3, COLORS.warn, 0.9);
    g.strokeRoundedRect(-300, -46, 600, 92, 18);
    banner.add(g);
    banner.add(
      this.add
        .text(0, 0, '📳 긴급 상황 발생!', {
          fontFamily: FONT,
          fontSize: '36px',
          color: COLORS.warnCss,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
    );
    this.tweens.add({ targets: banner, y: 130, duration: 350, ease: 'Back.easeOut' });

    this.time.delayedCall(1000, () => {
      banner.destroy();
      if (this.finished) {
        this.miniActive = false;
        return;
      }
      const mini = questManager.pickMini();
      this.scene.launch(mini, { returnTo: this.scene.key });
      this.scene.pause();
    });
  }

  private onResumeFromMini(): void {
    this.miniActive = false;
    if (this.finished) return;
    if (gameState.hp <= 0) {
      this.fail('미니 퀘스트 실패의 대가는 컸다...');
      return;
    }
    showToast(this, '휴... 다시 집중하자');
  }

  // ── 선배 등장 루프 ────────────────────────────

  /**
   * 선배는 예고 없이 갑자기 등장한다. 등장 순간 화면이 흔들리고 비네트가 켜지는 것이
   * 유일한 신호 — 그때부터가 반응속도 승부. 각 씬은 onEnter에서 자체 반응 유예
   * 시간(reactMs/graceMs 등)을 두고 플레이어의 대응을 판정한다.
   */
  protected startSeniorLoop(handlers: SeniorLoopHandlers): void {
    const cycle = (): void => {
      if (this.finished) return;
      const p = handlers.params();
      this.time.delayedCall(p.gapMs, () => {
        if (this.finished) return;
        audio.door();
        this.setDanger('in');
        this.cameras.main.shake(140, 0.006);
        handlers.onEnter();
        this.time.delayedCall(p.stayMs, () => {
          if (this.finished) return;
          this.setDanger('off');
          handlers.onLeave();
          cycle();
        });
      });
    };
    cycle();
  }

  // ── 결과 처리 ────────────────────────────────

  protected succeed(message: string): void {
    if (this.finished) return;
    this.finished = true;
    this.setDanger('off');
    audio.stopAll();
    audio.fanfare();
    this.cameras.main.flash(400, 78, 204, 163);
    this.time.delayedCall(900, () => {
      this.scene.start('Result', { success: true, reason: message });
    });
  }

  protected fail(reason: string): void {
    if (this.finished) return;
    this.finished = true;
    audio.stopAll();
    audio.caught();
    audio.gameover();
    this.cameras.main.shake(500, 0.012);
    this.cameras.main.flash(500, 233, 69, 96);
    this.time.delayedCall(1200, () => {
      this.scene.start('Result', { success: false, reason });
    });
  }

  /** HP 감소 + 토스트. HP 0 도달 시 게임 오버 */
  protected applyDamage(amount: number, message?: string): void {
    if (this.finished) return;
    const dead = gameState.damage(amount);
    if (message) {
      audio.buzz();
      showToast(this, message, COLORS.warnCss);
      this.cameras.main.shake(200, 0.006);
    }
    this.hpBar.setHp(gameState.hp);
    if (dead) this.fail('HP가 바닥나 쓰러졌다...');
  }
}
