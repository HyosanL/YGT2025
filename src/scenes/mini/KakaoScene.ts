import Phaser from 'phaser';
import { FONT, GAME_WIDTH, M1_KAKAO } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import type { KakaoPrompt } from '../../types';
import { createHiddenInput, type HiddenInput } from '../../utils/mobileInput';
import { pick } from '../../utils/rng';
import { BaseMiniScene, KAKAO, PANEL } from './BaseMiniScene';
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

    // ── 상대 메시지 (좌측: 아바타 + 이름 + 흰 버블 + 시각) ──
    const msgY = PANEL.y + 300;
    const avatar = this.add.graphics();
    avatar.fillStyle(0x7d8a99, 1);
    avatar.fillRoundedRect(PANEL.x + 34, msgY - 38, 64, 64, 24);
    this.add
      .text(PANEL.x + 66, msgY - 6, '😠', { fontFamily: FONT, fontSize: '34px' })
      .setOrigin(0.5);
    this.add
      .text(PANEL.x + 112, msgY - 58, '김선배', {
        fontFamily: FONT,
        fontSize: '22px',
        color: KAKAO.sub,
      })
      .setOrigin(0, 0.5);

    const bubble = this.add.graphics();
    const msgWidth = Math.min(440, this.prompt.msg.length * 28 + 56);
    bubble.fillStyle(KAKAO.bubbleWhite, 1);
    bubble.fillRoundedRect(PANEL.x + 112, msgY - 32, msgWidth, 64, 16);
    // 말풍선 꼬리
    bubble.fillTriangle(
      PANEL.x + 112,
      msgY - 24,
      PANEL.x + 100,
      msgY - 12,
      PANEL.x + 112,
      msgY - 4
    );
    this.add
      .text(PANEL.x + 112 + msgWidth / 2, msgY, this.prompt.msg, {
        fontFamily: FONT,
        fontSize: '27px',
        color: KAKAO.textDark,
      })
      .setOrigin(0.5);
    this.add
      .text(PANEL.x + 118 + msgWidth, msgY + 22, '오후 9:47', {
        fontFamily: FONT,
        fontSize: '18px',
        color: KAKAO.sub,
      })
      .setOrigin(0, 0.5);

    // 보낼 답장 문장은 캔버스가 아니라 입력창 위의 DOM 라벨(노란 버블)로 표시한다
    // — 가상 키보드가 올라와도 입력창과 함께 화면에 남아 항상 보인다
    this.add
      .text(GAME_WIDTH / 2, msgY + 118, '👇 노란 문장을 그대로 입력해서 전송! (느낌표까지)', {
        fontFamily: FONT,
        fontSize: '25px',
        color: '#4a5568',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.hintText = this.add
      .text(GAME_WIDTH / 2, msgY + 392, '⌨️ 입력창을 탭하면 키보드가 올라온다!', {
        fontFamily: FONT,
        fontSize: '24px',
        color: '#c0392b',
      })
      .setOrigin(0.5);

    new Button(this, GAME_WIDTH / 2, PANEL.y + PANEL.h - 90, {
      label: '📨 전송',
      width: 320,
      height: 100,
      color: KAKAO.yellow,
      labelColor: KAKAO.textBrown,
      strokeColor: 0xd6c200,
      fontSize: 36,
      onClick: () => this.send(),
    });

    // 보이는 input을 게임 좌표에 겹쳐 배치 — 씬 진입 즉시 키보드 요청,
    // 포커스(또는 첫 입력) 확인 후 타이머 시작
    this.hiddenInput = createHiddenInput({
      onInput: (value) => this.onTyped(value),
      onEnter: () => this.send(),
      onFocus: () => this.beginCountdown(),
      rect: { x: PANEL.x + 40, y: msgY + 252, w: PANEL.w - 80, h: 88 },
      style: {
        background: '#ffffff',
        border: '2px solid #9fb3c4',
        color: KAKAO.textDark,
        caretColor: '#d4a017',
      },
      // 따라 칠 문장 — 키보드가 올라와도 입력창 위에 붙어 항상 보인다
      label: { text: this.prompt.reply, background: '#fee500', color: KAKAO.textBrown },
    });
    this.hiddenInput.focus();

    // input 밖(패널 어디든)을 탭해도 포커스 재시도 — 제스처 안에서 focus가 불려 확실해진다
    this.add
      .zone(0, 0, GAME_WIDTH, PANEL.y + PANEL.h - 160)
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
