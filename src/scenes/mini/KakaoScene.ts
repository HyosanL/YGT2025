import Phaser from 'phaser';
import { COLORS, FONT, GAME_WIDTH, M1_KAKAO } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import type { KakaoPrompt } from '../../types';
import { createHiddenInput, type HiddenInput } from '../../utils/mobileInput';
import { pick } from '../../utils/rng';
import { BaseMiniScene, PANEL } from './BaseMiniScene';
import { Button } from '../../ui/Button';

/**
 * M1. 카톡 답장하기 — 7초 안에 제시된 문장을 정확히 타이핑.
 * 숨겨진 <input>으로 모바일 가상 키보드를 띄우고, 키보드 포커스 확인 후 타이머 시작.
 * 실제 카톡 캡처 이미지는 사용자 제공 예정(src/assets/img/kakao/) — 그 전까지 메신저풍 목업.
 */
export class KakaoScene extends BaseMiniScene {
  private prompt!: KakaoPrompt;
  private typedText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private hiddenInput: HiddenInput | null = null;
  private timerStarted = false;

  constructor() {
    super({ key: 'kakao' });
  }

  create(): void {
    this.timerStarted = false;
    this.setupOverlay('💬 선배의 카톡!');

    const tier = M1_KAKAO.tier(gameState.day);
    const pool = M1_KAKAO.prompts.filter((p) => p.tier === tier);
    this.prompt = pick(pool.length > 0 ? pool : M1_KAKAO.prompts);

    audio.ding();

    // 채팅방 헤더
    const header = this.add.graphics();
    header.fillStyle(0x1f2a44, 1);
    header.fillRoundedRect(PANEL.x + 20, PANEL.y + 140, PANEL.w - 40, 70, 12);
    this.add
      .text(PANEL.x + 50, PANEL.y + 175, '😠 김선배', {
        fontFamily: FONT,
        fontSize: '30px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);

    // 선배 메시지 버블 (좌측)
    const msgY = PANEL.y + 260;
    const bubble = this.add.graphics();
    bubble.fillStyle(0xffffff, 0.95);
    const msgWidth = Math.min(480, this.prompt.msg.length * 30 + 60);
    bubble.fillRoundedRect(PANEL.x + 30, msgY - 34, msgWidth, 68, 18);
    this.add
      .text(PANEL.x + 30 + msgWidth / 2, msgY, this.prompt.msg, {
        fontFamily: FONT,
        fontSize: '28px',
        color: '#1a1a2e',
      })
      .setOrigin(0.5);

    // 입력할 답장 안내
    this.add
      .text(GAME_WIDTH / 2, msgY + 110, '👇 이 문장을 그대로 입력해서 전송!', {
        fontFamily: FONT,
        fontSize: '26px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5);
    const targetBg = this.add.graphics();
    targetBg.fillStyle(0xf7e600, 0.9);
    targetBg.fillRoundedRect(PANEL.x + 40, msgY + 150, PANEL.w - 80, 76, 18);
    this.add
      .text(GAME_WIDTH / 2, msgY + 188, this.prompt.reply, {
        fontFamily: FONT,
        fontSize: '32px',
        color: '#1a1a2e',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // 입력 표시 영역
    const typedBg = this.add.graphics();
    typedBg.fillStyle(0x0d1424, 1);
    typedBg.fillRoundedRect(PANEL.x + 40, msgY + 260, PANEL.w - 80, 90, 14);
    typedBg.lineStyle(2, COLORS.warn, 0.7);
    typedBg.strokeRoundedRect(PANEL.x + 40, msgY + 260, PANEL.w - 80, 90, 14);
    this.typedText = this.add
      .text(GAME_WIDTH / 2, msgY + 305, '', {
        fontFamily: FONT,
        fontSize: '32px',
        color: COLORS.textCss,
      })
      .setOrigin(0.5);

    this.hintText = this.add
      .text(GAME_WIDTH / 2, msgY + 400, '키보드를 기다리는 중... (안 뜨면 화면을 탭!)', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.warnCss,
      })
      .setOrigin(0.5);

    new Button(this, GAME_WIDTH / 2, PANEL.y + PANEL.h - 90, {
      label: '📨 전송',
      width: 320,
      height: 100,
      color: COLORS.safe,
      fontSize: 36,
      onClick: () => this.send(),
    });

    // 숨겨진 input — 씬 진입 즉시 키보드 요청, 포커스 확인 후 타이머 시작
    this.hiddenInput = createHiddenInput({
      onInput: (value) => this.onTyped(value),
      onEnter: () => this.send(),
      onFocus: () => this.beginCountdown(),
    });
    this.hiddenInput.focus();

    // 모바일에서 제스처 없이는 포커스가 안 될 수 있음 → 화면 탭으로 재시도
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
    this.typedText.setText(value.length > 0 ? value : '');
    const target = this.prompt.reply;
    if (value === target) {
      audio.ding();
      this.finishSuccess('세이프! 답장 완료.');
      return;
    }
    // 올바른 진행이면 흰색, 오타면 빨간색
    this.typedText.setColor(target.startsWith(value) ? COLORS.textCss : COLORS.accentCss);
  }

  private send(): void {
    if (this.done || !this.hiddenInput) return;
    if (this.hiddenInput.value === this.prompt.reply) {
      this.finishSuccess('세이프! 답장 완료.');
    } else {
      this.finishFail('오타가 있는 채로 전송해버렸다... "뭐라는 거냐 너"');
    }
  }
}
