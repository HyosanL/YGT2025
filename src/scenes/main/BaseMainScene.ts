import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { audio, type BgmKey } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import { questManager } from '../../core/QuestManager';
import { showToast } from '../../ui/Button';
import { Cadet, speechBubble } from '../../ui/Characters';
import { HpBar } from '../../ui/HpBar';
import { LivesBar } from '../../ui/LivesBar';
import { HAPTIC, vibrate } from '../../utils/haptics';

export interface SeniorLoopParams {
  gapMs: number;
  stayMs: number;
}

/**
 * 선배 등장 리듬의 설계값.
 *
 * 등장 간격을 매번 같은 범위에서 뽑으면 몇 판 만에 몸이 외워버려 단조로워진다.
 * 그래서 **패턴**(연타/페인트/장기체류/뜸들이기)을 섞어 예측을 무너뜨리되,
 * 아래 두 가지 안전장치로 '운이 나빠서 지는 판'은 만들지 않는다:
 *  - `minRecoveryMs`: 조우와 조우 사이에 반드시 확보되는 진행 시간
 *  - `maxPresenceRatio`: 선배가 화면에 있을 수 있는 시간의 총량 상한
 * 두 값이 있으면 "필요한 진행량 ÷ (1 − 점유율)" 만큼의 시간이 항상 남으므로
 * 제한시간 안에 목표를 채우는 경로가 수학적으로 보장된다.
 */
export interface SeniorTempo {
  /** 조우 사이 기본 간격 (ms) — 패턴에 따라 이 값이 흩어진다 */
  baseGapMs: number;
  /** 기본 체류 시간 (ms) */
  baseStayMs: number;
  /** 조우가 끝난 뒤 반드시 주어지는 최소 회복 시간 (ms) */
  minRecoveryMs: number;
  /** 선배가 화면에 있어도 되는 시간 비율 상한 (0~1) */
  maxPresenceRatio: number;
}

export interface SeniorLoopHandlers {
  /** 매 사이클마다 호출 — 일차별 템포 설계값 반환 */
  tempo: () => SeniorTempo;
  /** 선배가 예고 없이 등장하는 순간 — 여기서부터 반응속도 승부가 시작된다 */
  onEnter: () => void;
  onLeave: () => void;
}

/** 조우 한 번의 성격 — 무엇을 흔들지 */
type EncounterPattern = 'single' | 'burst' | 'feint' | 'linger' | 'lull';

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
  private livesBar!: LivesBar;
  private miniActive = false;
  private resumeContext: 'mini' | 'pause' | null = null;
  private dangerG!: Phaser.GameObjects.Graphics;
  private dangerTween: Phaser.Tweens.Tween | null = null;
  private seniorHandlers: SeniorLoopHandlers | null = null;
  private seniorActive = false;
  private seniorTimer: Phaser.Time.TimerEvent | null = null;
  /** 씬 시작 후 흐른 시간 / 그중 선배가 화면에 있던 시간 — 점유율 상한 계산용 */
  private loopElapsedMs = 0;
  private loopPresentMs = 0;
  /** 연타 패턴에서 남은 추가 등장 횟수 */
  private burstLeft = 0;

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
    // 목숨 하트 (HP 바 아래) — 부분 채움 + 반투명 빈 하트
    this.livesBar = new LivesBar(this, 26, 70, 38);
    this.livesBar.setLives(gameState.livesUnits);
    // 우측 상단 아이콘 칩 배경 (플랫 + 굵은 외곽선 — 캐릭터 화풍과 통일)
    const iconBg = this.add.graphics().setDepth(999);
    for (const cx of [GAME_WIDTH - 56, GAME_WIDTH - 144]) {
      iconBg.fillStyle(0xf4f2ec, 0.96);
      iconBg.fillCircle(cx, 56, 34);
      iconBg.lineStyle(3.5, 0x14141a, 1);
      iconBg.strokeCircle(cx, 56, 34);
    }

    // 우측 상단 🔊 = 소리 설정 (일시정지 메뉴를 열고 그 위에 볼륨 패널 — 게임은 안전하게 정지)
    const volBtn = this.add
      .text(GAME_WIDTH - 24, 24, '🔊', { fontFamily: FONT, fontSize: '44px' })
      .setOrigin(1, 0)
      .setPadding(10)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });
    volBtn.on('pointerdown', () => this.openPauseMenu(true));
    this.createPauseButton();
    this.createDangerVignette();
    if (gameState.practiceMode) {
      // 연습 모드 — 미니 퀘스트 난입 없음 + 상단 배지
      this.add
        .text(GAME_WIDTH / 2, 26, '🎓 연습 모드', {
          fontFamily: FONT,
          fontSize: '24px',
          color: COLORS.warnCss,
          fontStyle: 'bold',
          backgroundColor: 'rgba(0,0,0,0.6)',
          padding: { x: 16, y: 6 },
        })
        .setOrigin(0.5, 0)
        .setDepth(1000);
    } else {
      this.scheduleMiniQuests();
    }

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

  /** 백그라운드 전환 등 외부에서 강제 일시정지가 필요할 때 (내부 가드 동일) */
  autoPause(): void {
    this.openPauseMenu();
  }

  private openPauseMenu(openVolume = false): void {
    // resumeContext가 남아 있으면 이미 일시정지/미니 진입이 진행 중 (연타 가드)
    if (this.finished || this.miniActive || this.resumeContext !== null || this.scene.isPaused()) {
      return;
    }
    this.resumeContext = 'pause';
    // 일시정지 중에는 생존시간 시계도 멈춘다 (시간 부풀리기 방지)
    gameState.holdClock();
    // 진행 중인 선배 조우를 정리해 두면 재개 카운트다운 후 동결된 판정이 터지지 않는다
    this.clearSeniorEncounter();
    // 샤워 노래·전자레인지 가동음은 씬 pause와 무관하게 흐르므로 명시적으로 정지
    // (tick이 재개되면 자동으로 되살아난다)
    audio.setSongPlaying(false);
    audio.stopMicrowaveHum();
    // 일시정지 = 모든 소리 정지 (재개 카운트다운/소리 설정 중에는 잠깐 풀린다)
    audio.setPauseMuted(true);
    this.scene.launch('Pause', { returnTo: this.scene.key, mode: 'menu', openVolume });
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
    // resumeContext가 설정된 프레임 = 미니퀘스트/일시정지 진입 직후 —
    // scene.pause()와 같은 프레임에 tick이 한 번 더 돌며 노래를 되살리는 것을 방지
    if (this.finished || this.resumeContext !== null) return;
    this.hpBar.setHp(gameState.hp);
    this.livesBar.setLives(gameState.livesUnits);
    this.tick(delta);
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
      // 샤워 노래·전자레인지 가동음은 씬 pause와 무관하게 흐르므로 정지
      // (본 임무 복귀 후 tick이 다시 켠다)
      audio.setSongPlaying(false);
      audio.stopMicrowaveHum();
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
      // 일시정지 해제 — 생존시간 시계 재개 + 무음 해제 (안전망)
      gameState.releaseClock();
      audio.setPauseMuted(false);
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
    this.loopElapsedMs = 0;
    this.loopPresentMs = 0;
    this.burstLeft = 0;
    this.scheduleSeniorCycle();
  }

  /**
   * 다음 조우의 성격을 뽑는다. 뻔한 간격이 반복되지 않도록 확률을 흩어 놓되,
   * 어느 패턴이 나오든 뒤이어 공정성 보정을 통과해야 실제로 스케줄된다.
   */
  private pickPattern(): EncounterPattern {
    const roll = Math.random();
    if (roll < 0.44) return 'single'; // 평범한 한 번
    if (roll < 0.62) return 'burst'; // 짧게 두세 번 몰아친다
    if (roll < 0.76) return 'feint'; // 고개만 들이밀고 사라진다
    if (roll < 0.9) return 'linger'; // 오래 머문다
    return 'lull'; // 한참 뜸을 들인다
  }

  private scheduleSeniorCycle(extraDelayMs = 0): void {
    const h = this.seniorHandlers;
    if (!h || this.finished) return;
    this.seniorTimer?.remove(); // 중복 사이클 방지
    const t = h.tempo();

    // 연타 중이면 패턴을 새로 뽑지 않고 곧바로 한 번 더 들이닥친다
    const pattern: EncounterPattern = this.burstLeft > 0 ? 'burst' : this.pickPattern();
    const jitter = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

    let gapMs = t.baseGapMs * jitter(0.8, 1.3);
    let stayMs = t.baseStayMs * jitter(0.85, 1.2);
    switch (pattern) {
      case 'burst':
        // 짧게 여러 번 — 간격도 체류도 짧다
        if (this.burstLeft <= 0) this.burstLeft = Math.random() < 0.4 ? 2 : 1;
        else this.burstLeft -= 1;
        gapMs = t.baseGapMs * jitter(0.3, 0.5);
        stayMs = t.baseStayMs * jitter(0.5, 0.7);
        break;
      case 'feint':
        stayMs = t.baseStayMs * jitter(0.35, 0.55);
        break;
      case 'linger':
        stayMs = t.baseStayMs * jitter(1.5, 2.0);
        break;
      case 'lull':
        gapMs = t.baseGapMs * jitter(1.8, 2.6);
        break;
      case 'single':
        break;
    }

    // ── 공정성 보정 ──
    // ① 조우 사이 최소 회복 시간은 무슨 일이 있어도 준다
    gapMs = Math.max(gapMs, t.minRecoveryMs);
    // ② 점유율 상한: 이번 체류까지 더했을 때 상한을 넘으면 그만큼 간격을 벌린다.
    //    (P + s) / (E + g + s) ≤ r  →  g ≥ (P + s)/r − E − s
    const needed =
      (this.loopPresentMs + stayMs) / t.maxPresenceRatio - this.loopElapsedMs - stayMs;
    if (needed > gapMs) gapMs = needed;

    this.loopElapsedMs += gapMs + stayMs;
    this.loopPresentMs += stayMs;

    this.seniorTimer = this.time.delayedCall(gapMs + extraDelayMs, () => {
      if (this.finished) return;
      audio.door();
      this.setDanger('in');
      this.cameras.main.shake(140, 0.006);
      this.seniorActive = true;
      h.onEnter();
      this.seniorTimer = this.time.delayedCall(stayMs, () => {
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

  /** 연습 모드 종료 — 결과 화면 대신 설명(도움말)으로 복귀 */
  private finishPractice(success: boolean, reason: string): void {
    gameState.endPractice();
    this.scene.start('Title', {
      openHelp: true,
      practiceMsg: success ? `✅ 연습 성공! ${reason}` : `❌ 연습 실패... ${reason}`,
    });
  }

  protected succeed(message: string): void {
    if (this.finished) return;
    this.finished = true;
    this.setDanger('off');
    audio.stopAll();
    audio.fanfare();
    vibrate(HAPTIC.success);
    this.cameras.main.flash(300, 78, 204, 163);
    this.time.delayedCall(550, () => {
      if (gameState.practiceMode) this.finishPractice(true, message);
      else this.scene.start('Result', { success: true, reason: message });
    });
  }

  protected fail(reason: string): void {
    if (this.finished) return;
    this.finished = true;
    audio.stopAll();
    audio.caught();
    audio.gameover();
    vibrate(HAPTIC.fail);
    this.cameras.main.shake(400, 0.012);
    this.cameras.main.flash(400, 233, 69, 96);
    this.time.delayedCall(900, () => {
      if (gameState.practiceMode) this.finishPractice(false, reason);
      else this.scene.start('Result', { success: false, reason });
    });
  }

  /**
   * 선배에게 걸린 경우의 게임 오버 — 두 박자로 몰아친다.
   * ① 다리가 회오리로 뭉개질 만큼 빠르게 달려와 화면 중앙에 선다.
   * ② 그대로 상반신 클로즈업으로 확 붙으며 "뭐 하냐?" — 모자 챙 그림자에 눈이 잠긴 얼굴이
   *    화면을 꽉 채운다.
   */
  protected failCaught(senior: Cadet, reason: string, line = '뭐 하냐?'): void {
    if (this.finished) return;
    this.finished = true;
    this.setDanger('off');
    audio.stopAll();
    audio.caught();
    vibrate(HAPTIC.fail);

    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0)
      .setDepth(3400);
    this.tweens.add({ targets: dim, fillAlpha: 0.55, duration: 350 });

    this.tweens.killTweensOf(senior);
    senior.setVisible(true).setAlpha(1).setDepth(3500);
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
        this.slamCloseup(line);
      },
    });
    this.time.delayedCall(2100, () => {
      if (gameState.practiceMode) this.finishPractice(false, reason);
      else this.scene.start('Result', { success: false, reason });
    });
  }

  /** 상반신 클로즈업이 화면을 덮치며 한마디 던진다 */
  private slamCloseup(line: string): void {
    this.cameras.main.shake(320, 0.012);
    audio.gameover();

    const face = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, 'senior_closeup')
      .setDepth(3550)
      .setAlpha(0);
    // 화면 가로를 넘치도록 — 얼굴이 코앞까지 들이닥친 느낌
    const target = (GAME_WIDTH * 1.18) / face.width;
    face.setScale(target * 1.35);
    this.tweens.add({
      targets: face,
      alpha: 1,
      scale: target,
      duration: 220,
      ease: 'Cubic.easeOut',
    });
    speechBubble(this, GAME_WIDTH / 2, GAME_HEIGHT - 200, line, 1600, 3600);
  }

  /** HP 감소 + 토스트. HP 0 도달 시 게임 오버 */
  protected applyDamage(amount: number, message?: string): void {
    if (this.finished) return;
    const dead = gameState.damage(amount);
    if (message) {
      audio.buzz();
      vibrate(HAPTIC.damage);
      showToast(this, message);
      this.cameras.main.shake(200, 0.006);
    }
    this.hpBar.setHp(gameState.hp);
    if (dead) this.fail('HP가 바닥나 쓰러졌다...');
  }
}
