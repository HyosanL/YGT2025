import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { audio, type BgmKey } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import { questManager } from '../../core/QuestManager';
import { addMuteButton, showToast } from '../../ui/Button';
import { Cadet, speechBubble } from '../../ui/Characters';
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
  private resumeContext: 'mini' | 'pause' | null = null;
  private dangerG!: Phaser.GameObjects.Graphics;
  private dangerTween: Phaser.Tweens.Tween | null = null;
  private seniorHandlers: SeniorLoopHandlers | null = null;
  private seniorActive = false;
  private seniorTimer: Phaser.Time.TimerEvent | null = null;

  /** 서브클래스 create()에서 배경을 그린 뒤 호출 */
  protected setupCommon(): void {
    this.finished = false;
    this.miniActive = false;
    this.resumeContext = null;
    this.seniorHandlers = null;
    this.seniorActive = false;
    this.seniorTimer = null;
    this.day = gameState.day;
    this.hpBar = new HpBar(this);
    addMuteButton(this);
    this.createPauseButton();
    this.createDangerVignette();
    this.scheduleMiniQuests();

    const track = this.bgmTrack();
    if (track) audio.startBgm(track);
    else audio.stopBgm();

    this.events.on(Phaser.Scenes.Events.RESUME, this.onSceneResume, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.RESUME, this.onSceneResume, this);
      audio.stopAll();
    });
  }

  /** 씬별 BGM 트랙 — 노래 자체가 게임플레이인 샤워, 정적이 연출인 벽치기는 null로 오버라이드 */
  protected bgmTrack(): BgmKey | null {
    return 'field';
  }

  // ── 일시정지 ─────────────────────────────────

  private createPauseButton(): void {
    const btn = this.add
      .text(GAME_WIDTH - 108, 24, '⏸', { fontFamily: FONT, fontSize: '44px' })
      .setOrigin(1, 0)
      .setPadding(14)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => this.openPauseMenu());
  }

  private openPauseMenu(): void {
    // resumeContext가 남아 있으면 이미 일시정지/미니 진입이 진행 중 (연타 가드)
    if (this.finished || this.miniActive || this.resumeContext !== null || this.scene.isPaused()) {
      return;
    }
    this.resumeContext = 'pause';
    // 진행 중인 선배 조우를 정리해 두면 재개 카운트다운 후 동결된 판정이 터지지 않는다
    this.clearSeniorEncounter();
    // 샤워 노래 등 window 타이머 기반 사운드는 씬 pause와 무관하게 흐르므로 명시적으로 정지
    audio.setSongPlaying(false);
    this.scene.launch('Pause', { returnTo: this.scene.key, mode: 'menu' });
    this.scene.pause();
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
    // 은은한 경고 (과하지 않게 — 등장 연출의 주역은 선배 본인)
    this.dangerTween = this.tweens.add({
      targets: this.dangerG,
      alpha: { from: 0.07, to: 0.13 },
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
    this.tweens.add({ targets: banner, y: 130, duration: 220, ease: 'Back.easeOut' });

    this.time.delayedCall(600, () => {
      banner.destroy();
      if (this.finished) {
        this.miniActive = false;
        return;
      }
      // pause 직전 진행 중인 선배 조우/판정을 강제 종료 — 복귀 직후
      // 동결됐던 반응 판정이 터져 대응 불가로 죽는 상황을 방지한다
      this.clearSeniorEncounter();
      this.resumeContext = 'mini';
      const mini = questManager.pickMini();
      this.scene.launch(mini, { returnTo: this.scene.key });
      this.scene.pause();
    });
  }

  private onSceneResume(): void {
    const ctx = this.resumeContext;
    this.resumeContext = null;
    if (ctx === 'mini') {
      this.miniActive = false;
      if (this.finished) return;
      if (gameState.hp <= 0) {
        this.fail('미니 퀘스트 실패의 대가는 컸다...');
        return;
      }
      showToast(this, '휴... 다시 집중하자');
      // 새 gap으로 선배 사이클 재시작 (+ 정신 차릴 시간 약간)
      this.scheduleSeniorCycle(600);
      return;
    }
    if (ctx === 'pause') {
      if (this.finished) return;
      // 일시정지로 정리했던 선배 사이클 재가동 (카운트다운이 이미 마음의 준비를 줬다)
      this.scheduleSeniorCycle(400);
    }
  }

  // ── 선배 등장 루프 ────────────────────────────

  /**
   * 선배는 예고 없이 갑자기 등장한다. 등장 순간 화면이 흔들리고 비네트가 켜지는 것이
   * 유일한 신호 — 그때부터가 반응속도 승부. 각 씬은 onEnter에서 자체 반응 유예
   * 시간(reactMs/graceMs 등)을 두고 플레이어의 대응을 판정한다.
   */
  protected startSeniorLoop(handlers: SeniorLoopHandlers): void {
    this.seniorHandlers = handlers;
    this.scheduleSeniorCycle();
  }

  private scheduleSeniorCycle(extraDelayMs = 0): void {
    const h = this.seniorHandlers;
    if (!h || this.finished) return;
    this.seniorTimer?.remove(); // 중복 사이클 방지
    const p = h.params();
    this.seniorTimer = this.time.delayedCall(p.gapMs + extraDelayMs, () => {
      if (this.finished) return;
      audio.door();
      this.setDanger('in');
      this.cameras.main.shake(140, 0.006);
      this.seniorActive = true;
      h.onEnter();
      this.seniorTimer = this.time.delayedCall(p.stayMs, () => {
        if (this.finished) return;
        this.seniorActive = false;
        this.setDanger('off');
        h.onLeave();
        this.scheduleSeniorCycle();
      });
    });
  }

  /**
   * 진행 중인 선배 조우와 예약 타이머를 즉시 정리한다 (미니퀘스트 진입용).
   * onLeave가 seniorState를 'away'로 되돌리므로, 동결된 반응 판정
   * delayedCall이 복귀 후 발화해도 가드에 걸려 무해해진다.
   */
  private clearSeniorEncounter(): void {
    if (!this.seniorHandlers) return;
    this.seniorTimer?.remove();
    this.seniorTimer = null;
    if (this.seniorActive) {
      this.seniorActive = false;
      this.setDanger('off');
      this.seniorHandlers.onLeave();
    }
  }

  // ── 결과 처리 ────────────────────────────────

  protected succeed(message: string): void {
    if (this.finished) return;
    this.finished = true;
    this.setDanger('off');
    audio.stopAll();
    audio.fanfare();
    this.cameras.main.flash(300, 78, 204, 163);
    this.time.delayedCall(550, () => {
      this.scene.start('Result', { success: true, reason: message });
    });
  }

  protected fail(reason: string): void {
    if (this.finished) return;
    this.finished = true;
    audio.stopAll();
    audio.caught();
    audio.gameover();
    this.cameras.main.shake(400, 0.012);
    this.cameras.main.flash(400, 233, 69, 96);
    this.time.delayedCall(900, () => {
      this.scene.start('Result', { success: false, reason });
    });
  }

  /**
   * 선배에게 걸린 경우의 게임 오버 — 그 선배가 화면 중앙으로 달려와
   * "뭐 하냐?" 한마디를 던지고 끝난다.
   */
  protected failCaught(senior: Cadet, reason: string, line = '뭐 하냐?'): void {
    if (this.finished) return;
    this.finished = true;
    this.setDanger('off');
    audio.stopAll();
    audio.caught();

    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0)
      .setDepth(3400);
    this.tweens.add({ targets: dim, fillAlpha: 0.55, duration: 350 });

    this.tweens.killTweensOf(senior);
    senior.setVisible(true).setAlpha(1).setDepth(3500);
    senior.setFace('😡');
    senior.setMotion('run');
    this.tweens.add({
      targets: senior,
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2 + 140,
      scale: 1.5,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        senior.setMotion('idle');
        speechBubble(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 140, line, 1500, 3600);
        this.cameras.main.shake(300, 0.01);
        audio.gameover();
      },
    });
    this.time.delayedCall(1750, () => {
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
