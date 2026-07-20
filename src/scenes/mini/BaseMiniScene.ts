import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, MINI } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import { HAPTIC, vibrate } from '../../utils/haptics';
import type { MiniSceneData } from '../../types';
import { drawKakaoDate, drawKakaoRoom, KAKAO, type KakaoRoom } from '../../ui/kakao';

export const PANEL = { x: 40, y: 116, w: GAME_WIDTH - 80, h: 1044 } as const;

export { KAKAO };

export type MiniTheme = 'dark' | 'kakao';

/**
 * 미니 퀘스트 공통 베이스 (메인 씬 pause 위에 오버레이로 launch됨).
 * - 반투명 백드롭 + 패널
 * - 카운트다운 타이머 (붉은 펄스 압박 연출 포함)
 * - 성공 → 메인 씬 resume / 실패 → 즉시 게임 오버 (config로 HP 페널티 전환 가능)
 */
export abstract class BaseMiniScene extends Phaser.Scene {
  protected returnTo = '';
  protected done = false;
  protected theme: MiniTheme = 'dark';

  private timerTotal = 0;
  private timerRemaining = 0;
  private timerActive = false;
  private onExpire: (() => void) | null = null;
  private timerFill: Phaser.GameObjects.Graphics | null = null;
  private timerText: Phaser.GameObjects.Text | null = null;
  private panicOverlay: Phaser.GameObjects.Rectangle | null = null;
  private lastSecond = -1;
  private pulseMs = 0;
  /** 타이머 바 y 오프셋 — 카톡 테마는 네비게이션 바 아래로 내린다 */
  private timerBarY = 90;
  /** 카톡 테마에서 말풍선을 쌓을 수 있는 대화 영역 */
  protected room: KakaoRoom = { top: PANEL.y, bottom: PANEL.y + PANEL.h, left: PANEL.x, right: PANEL.x + PANEL.w };
  /** 방 제목 옆 인원수 (단체방) — setupOverlay 전에 세팅 */
  protected roomMemberCount = 0;
  /** 입력바 플레이스홀더 */
  protected roomPlaceholder = '';

  init(data: MiniSceneData): void {
    this.returnTo = data.returnTo;
  }

  /** 백드롭 + 패널 + 타이틀 생성. create() 첫 줄에서 호출할 것 */
  protected setupOverlay(title: string, theme: MiniTheme = 'dark'): void {
    // 미니 퀘스트 동안 본 게임의 노래/가동음은 반드시 멈춘다 (방어적 이중 처리)
    audio.setSongPlaying(false);
    audio.stopMicrowaveHum();
    this.done = false;
    this.theme = theme;
    this.timerActive = false;
    this.timerFill = null;
    this.timerText = null;
    this.lastSecond = -1;
    this.pulseMs = 0;
    this.timerBarY = theme === 'kakao' ? 128 : 90;

    // 회색 처리된 본 게임 위에 미니 퀘스트 패널이 뜬다
    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x4a4d58, 0.72)
      .setOrigin(0)
      .setInteractive(); // 하위 씬으로의 입력 차단
    void dim;

    if (theme === 'kakao') {
      // 실제 카톡 채팅방 그대로 — 상태바 + 네비바 + 하늘색 대화 배경 + 입력바
      this.room = drawKakaoRoom(
        this,
        { x: PANEL.x, y: PANEL.y, w: PANEL.w, h: PANEL.h },
        { title, memberCount: this.roomMemberCount, placeholder: this.roomPlaceholder }
      );
      drawKakaoDate(this, PANEL.y + 196, '오늘');
      this.room.top = PANEL.y + 226;
    } else {
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
    }

    if (gameState.practiceMode) {
      this.add
        .text(GAME_WIDTH / 2, PANEL.y - 44, '🎓 연습 모드', {
          fontFamily: FONT,
          fontSize: '24px',
          color: COLORS.warnCss,
          fontStyle: 'bold',
          backgroundColor: 'rgba(0,0,0,0.6)',
          padding: { x: 16, y: 6 },
        })
        .setOrigin(0.5)
        .setDepth(600);
    }

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
      barBg.fillRoundedRect(PANEL.x + 30, PANEL.y + this.timerBarY, PANEL.w - 160, 30, 8);
      this.timerFill = this.add.graphics();
      this.timerText = this.add
        .text(PANEL.x + PANEL.w - 65, PANEL.y + this.timerBarY + 15, '', {
          fontFamily: FONT,
          fontSize: '48px',
          color: this.theme === 'kakao' ? KAKAO.textDark : COLORS.textCss,
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
      this.timerFill.fillRoundedRect(
        PANEL.x + 36,
        PANEL.y + this.timerBarY + 6,
        (PANEL.w - 172) * ratio,
        18,
        6
      );
    }
    const sec = Math.ceil(remain / 1000);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      audio.tick();
    }
    this.timerText
      ?.setText(`${sec}`)
      .setColor(panic ? COLORS.accentCss : this.theme === 'kakao' ? KAKAO.textDark : COLORS.textCss);
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
    vibrate(HAPTIC.miniSuccess);
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

    // 미니 퀘스트 성공 보상 — 목숨 ⅕ 적립 (연습 모드는 제외)
    if (!gameState.practiceMode && gameState.addLifeUnits(1)) {
      const lifeText = this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 90, '❤️ 목숨 +⅕ 적립!', {
          fontFamily: FONT,
          fontSize: '30px',
          color: COLORS.safeCss,
          fontStyle: 'bold',
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: { x: 20, y: 10 },
        })
        .setOrigin(0.5)
        .setDepth(600)
        .setAlpha(0);
      this.tweens.add({ targets: lifeText, alpha: 1, y: GAME_HEIGHT / 2 + 80, duration: 250 });
    }
    this.time.delayedCall(700, () => this.returnWithCountdown());
  }

  /**
   * 곧바로 본 게임으로 던지지 않고 회색 화면 위 빠른 카운트다운(3→2→1→시작!,
   * 총 ~1.7초)으로 손가락과 시선을 재정비할 시간을 준 뒤 resume한다.
   * 연습 모드였다면 설명(도움말)으로 복귀.
   */
  private returnWithCountdown(): void {
    if (gameState.practiceMode) {
      gameState.endPractice();
      this.scene.stop(this.returnTo);
      this.scene.start('Title', { openHelp: true });
      return;
    }
    this.scene.launch('Pause', {
      returnTo: this.returnTo,
      mode: 'countdown',
      count: 3,
      label: '본 임무로 복귀!',
    });
    this.scene.stop();
  }

  /**
   * 실패 = 목숨 반 칸 차감 후 하루는 이어서 진행.
   * 차감으로 목숨이 0이 되면 그대로 게임 오버.
   */
  protected finishFail(reason: string): void {
    if (this.done) return;
    this.done = true;
    this.stopTimer();

    audio.caught();
    audio.buzz();
    vibrate(HAPTIC.fail);
    this.cameras.main.shake(350, 0.009);

    // 연습 모드는 목숨을 깎지 않는다
    const alive = gameState.practiceMode ? true : gameState.deductLifeUnits(MINI.failLifeUnits);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, `❌ ${reason}`, {
        fontFamily: FONT,
        fontSize: '38px',
        color: COLORS.accentCss,
        fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.85)',
        padding: { x: 30, y: 20 },
        wordWrap: { width: GAME_WIDTH - 140 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(600);
    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 + 110,
        gameState.practiceMode ? '🎓 연습이라 목숨은 무사하다' : '💔 목숨 1칸이 날아갔다!',
        {
          fontFamily: FONT,
          fontSize: '30px',
          color: COLORS.warnCss,
          fontStyle: 'bold',
          backgroundColor: 'rgba(0,0,0,0.85)',
          padding: { x: 20, y: 10 },
        }
      )
      .setOrigin(0.5)
      .setDepth(600);

    this.time.delayedCall(1300, () => {
      if (!alive) {
        // 목숨이 바닥났다 — 진짜 게임 오버
        this.scene.stop(this.returnTo);
        this.scene.start('Result', { success: false, reason: `${reason} 목숨이 바닥났다.` });
        return;
      }
      this.returnWithCountdown();
    });
  }
}
