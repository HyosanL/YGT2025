import Phaser from 'phaser';
import { GAME_WIDTH, M1_KAKAO } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import type { KakaoPrompt } from '../../types';
import { createHiddenInput, type HiddenInput } from '../../utils/mobileInput';
import { pick } from '../../utils/rng';
import { BaseMiniScene, KAKAO, PANEL } from './BaseMiniScene';
import { drawIncoming, drawOutgoing, KAKAO_INPUT_H } from '../../ui/kakao';

/**
 * M1. 카톡 답장하기 — 제한 시간 안에 제시된 문장을 정확히 타이핑 (느낌표까지!).
 * **카톡 화면의 입력바 자체가 입력창**이다: 평소엔 채팅방 하단 입력바 자리에 얹혀 있고
 * (＋ · 흰 알약 · 노란 전송 ➤), 키보드가 뜨면 실제 카톡처럼 그 입력바가 키보드 위로
 * 올라온다. 따로 뜨는 팝업 입력창은 없다. 따라 칠 문장은 입력바 바로 위 노란 라벨.
 */
export class KakaoScene extends BaseMiniScene {
  private prompt!: KakaoPrompt;
  private hiddenInput: HiddenInput | null = null;
  private timerStarted = false;

  constructor() {
    super({ key: 'kakao' });
  }

  create(): void {
    this.timerStarted = false;
    // 입력바 내용(＋·전송)은 DOM 카톡 입력바가 그린다 — 흰 바 배경만 남긴다
    this.roomSkipInput = true;
    this.roomPlaceholder = '';
    this.setupOverlay('김선배', 'kakao');

    const tier = M1_KAKAO.tier(gameState.day);
    const pool = M1_KAKAO.prompts.filter((p) => p.tier === tier);
    this.prompt = pick(pool.length > 0 ? pool : M1_KAKAO.prompts);

    audio.ding();

    // ── 선배와 주고받은 대화 (앞선 대화가 있어야 진짜 채팅방처럼 보인다) ──
    let y = this.room.top;
    y += drawIncoming(this, {
      x: PANEL.x + 24,
      y,
      name: '김선배',
      avatarKey: 'avatar_kim',
      avatarEmoji: '😠',
      text: '너 어디냐',
      maxWidth: 280,
      time: '오후 9:44',
    });
    y += drawOutgoing(this, {
      x: this.room.right - 24,
      y,
      text: '생활관입니다!',
      maxWidth: 330,
      time: '오후 9:45',
      unread: 1,
    });
    y += drawIncoming(this, {
      x: PANEL.x + 24,
      y,
      name: '김선배',
      avatarKey: 'avatar_kim',
      avatarEmoji: '😠',
      text: this.prompt.msg,
      maxWidth: 440,
      time: '오후 9:47',
    });
    y += drawIncoming(this, {
      x: PANEL.x + 24,
      y,
      name: '김선배',
      avatarKey: 'avatar_kim',
      avatarEmoji: '😠',
      text: '읽씹?',
      maxWidth: 300,
      time: '오후 9:47',
    });

    // ── 카톡 입력바(DOM) = 실제 입력창 ──
    // ＋ · 흰 알약 입력창(메시지 입력) · 노란 전송 ➤. 위에는 따라 칠 노란 문장 라벨.
    // 평소엔 rect(채팅방 하단 입력바 자리)에, 키보드가 뜨면 키보드 바로 위로 올라온다.
    this.hiddenInput = createHiddenInput({
      onInput: (value) => this.onTyped(value),
      onEnter: () => this.send(),
      onFocus: () => this.beginCountdown(),
      onSend: () => this.send(),
      kakaoBar: true,
      placeholder: '메시지 입력',
      rect: { x: PANEL.x, y: PANEL.y + PANEL.h - KAKAO_INPUT_H, w: PANEL.w, h: KAKAO_INPUT_H },
      style: { color: KAKAO.textDark, caretColor: '#d4a017' },
      label: { text: this.prompt.reply, background: '#fee500', color: KAKAO.textBrown },
    });
    this.hiddenInput.focus();

    // 채팅 영역(입력바 위)을 탭해도 포커스 재시도 — 키보드가 내려갔을 때 다시 올린다
    this.add
      .zone(0, 0, GAME_WIDTH, PANEL.y + PANEL.h - KAKAO_INPUT_H)
      .setOrigin(0)
      .setInteractive()
      .on('pointerdown', () => this.hiddenInput?.focus());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hiddenInput?.destroy();
      this.hiddenInput = null;
    });
  }

  private beginCountdown(): void {
    if (this.timerStarted || this.done) return;
    this.timerStarted = true;
    this.startTimer(M1_KAKAO.timeMs, () =>
      this.finishFail('답장이 늦었다... 선배의 인내심이 바닥났다.')
    );
  }

  private onTyped(value: string): void {
    if (this.done) return;
    // 포커스 이벤트가 유실됐더라도 타이핑이 시작됐다면 타이머는 돌아야 공정하다
    this.beginCountdown();
    const target = this.prompt.reply;
    if (value === target) {
      audio.ding();
      this.hiddenInput?.el.blur(); // 키보드 내리고 결과 연출
      this.finishSuccess('세이프! 답장 완료.');
      return;
    }
    // 올바른 진행이면 검정, 오타면 빨간색
    this.hiddenInput?.setColor(target.startsWith(value) ? KAKAO.textDark : '#e94560');
  }

  private send(): void {
    if (this.done || !this.hiddenInput) return;
    this.hiddenInput.el.blur(); // 키보드 내리고 결과 연출
    if (this.hiddenInput.value === this.prompt.reply) {
      this.finishSuccess('세이프! 답장 완료.');
    } else {
      this.finishFail('오타가 있는 채로 전송해버렸다... "뭐라는 거냐 너"');
    }
  }
}
