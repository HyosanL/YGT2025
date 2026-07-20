import Phaser from 'phaser';
import { FONT, GAME_WIDTH, M1_KAKAO } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import type { KakaoPrompt } from '../../types';
import { createHiddenInput, type HiddenInput } from '../../utils/mobileInput';
import { pick } from '../../utils/rng';
import { BaseMiniScene, KAKAO, PANEL } from './BaseMiniScene';
import { drawIncoming, drawOutgoing, KAKAO_INPUT_H } from '../../ui/kakao';
import { Button } from '../../ui/Button';

/**
 * M1. 카톡 답장하기 — 제한 시간 안에 제시된 문장을 정확히 타이핑 (느낌표까지!).
 * 카톡풍 채팅방 디자인: 하늘색 배경 + 상대(흰) 버블 + 내(노랑) 버블.
 * 게임 좌표에 맞춰 겹쳐 놓은 '보이는' <input>이 키보드를 띄운다 (직접 탭 가능해 확실).
 * 키보드 포커스(또는 첫 입력) 확인 후 타이머 시작.
 */
export class KakaoScene extends BaseMiniScene {
  private prompt!: KakaoPrompt;
  private hintText!: Phaser.GameObjects.Text;
  private hiddenInput: HiddenInput | null = null;
  private timerStarted = false;

  constructor() {
    super({ key: 'kakao' });
  }

  create(): void {
    this.timerStarted = false;
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

    // 보낼 답장 문장은 캔버스가 아니라 입력창 위의 DOM 라벨(노란 버블)로 표시한다
    // — 가상 키보드가 올라와도 입력창과 함께 화면에 남아 항상 보인다
    this.add
      .text(GAME_WIDTH / 2, y + 24, '👇 노란 문장을 그대로 입력해서 전송! (느낌표까지)', {
        fontFamily: FONT,
        fontSize: '24px',
        color: '#3f4c5a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.hintText = this.add
      .text(GAME_WIDTH / 2, y + 66, '⌨️ 입력창을 탭하면 키보드가 올라온다!', {
        fontFamily: FONT,
        fontSize: '23px',
        color: '#b23b2e',
      })
      .setOrigin(0.5);

    // 실제 카톡처럼 입력바 오른쪽에 노란 전송 버튼
    const barMid = PANEL.y + PANEL.h - KAKAO_INPUT_H / 2;
    new Button(this, PANEL.x + PANEL.w - 56, barMid, {
      label: '➤',
      width: 88,
      height: 88,
      color: KAKAO.yellow,
      labelColor: KAKAO.textBrown,
      fontSize: 40,
      onClick: () => this.send(),
    });

    // 보이는 input을 게임 좌표에 겹쳐 배치 — 씬 진입 즉시 키보드 요청,
    // 포커스(또는 첫 입력) 확인 후 타이머 시작
    this.hiddenInput = createHiddenInput({
      onInput: (value) => this.onTyped(value),
      onEnter: () => this.send(),
      onFocus: () => this.beginCountdown(),
      rect: { x: PANEL.x + 62, y: barMid - 34, w: PANEL.w - 172, h: 68 },
      style: {
        background: '#ffffff',
        border: 'none',
        textAlign: 'left',
        color: KAKAO.textDark,
        caretColor: '#d4a017',
      },
      // 따라 칠 문장 — 키보드가 올라와도 입력창 위에 붙어 항상 보인다
      label: { text: this.prompt.reply, background: '#fee500', color: KAKAO.textBrown },
    });
    this.hiddenInput.focus();

    // input 밖(패널 어디든)을 탭해도 포커스 재시도 — 제스처 안에서 focus가 불려 확실해진다
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
    this.hintText.setText('빨리!!!');
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
