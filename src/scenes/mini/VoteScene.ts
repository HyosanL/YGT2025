import { COLORS, FONT, GAME_WIDTH, M2_VOTE } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import type { VoteQuestion } from '../../types';
import { Button } from '../../ui/Button';
import { pick } from '../../utils/rng';
import { BaseMiniScene, KAKAO, PANEL } from './BaseMiniScene';

/**
 * M2. 투표하기 — 다중 부정문으로 꼬인 선지 중 의미상 올바른 것을 제한 시간 안에 선택.
 * 카톡 단체방의 투표 카드 디자인: 하늘색 채팅방 + 흰 투표 카드 + 선지 버튼.
 */
export class VoteScene extends BaseMiniScene {
  private question!: VoteQuestion;
  private buttons: Button[] = [];

  constructor() {
    super({ key: 'vote' });
  }

  create(): void {
    this.setupOverlay('21기 생도대 단체방', 'kakao');
    this.buttons = [];

    const level = M2_VOTE.level(gameState.day);
    const pool = M2_VOTE.questions.filter((q) => q.level === level);
    this.question = pick(pool.length > 0 ? pool : M2_VOTE.questions);

    audio.ding();

    // ── 옹성오 선배 메시지 (좌측 흰 버블) ──
    const msgY = PANEL.y + 258;
    const avatar = this.add.graphics();
    avatar.fillStyle(0x5a6b7e, 1);
    avatar.fillRoundedRect(PANEL.x + 34, msgY - 36, 60, 60, 22);
    this.add
      .text(PANEL.x + 64, msgY - 6, '😤', { fontFamily: FONT, fontSize: '30px' })
      .setOrigin(0.5);
    this.add
      .text(PANEL.x + 108, msgY - 54, '옹성오', {
        fontFamily: FONT,
        fontSize: '21px',
        color: KAKAO.sub,
      })
      .setOrigin(0, 0.5);
    const bubble = this.add.graphics();
    bubble.fillStyle(KAKAO.bubbleWhite, 1);
    bubble.fillRoundedRect(PANEL.x + 108, msgY - 30, 420, 58, 16);
    bubble.fillTriangle(PANEL.x + 108, msgY - 22, PANEL.x + 96, msgY - 10, PANEL.x + 108, msgY + 2);
    this.add
      .text(PANEL.x + 318, msgY - 1, '긴급 설문이다. 지금 즉시 제출한다.', {
        fontFamily: FONT,
        fontSize: '25px',
        color: KAKAO.textDark,
      })
      .setOrigin(0.5);

    // ── 투표 카드 (카톡 투표 스타일) ──
    const cardX = PANEL.x + 30;
    const cardY = PANEL.y + 335;
    const cardW = PANEL.w - 60;
    const cardH = 605;
    const card = this.add.graphics();
    card.fillStyle(KAKAO.bubbleWhite, 1);
    card.fillRoundedRect(cardX, cardY, cardW, cardH, 18);
    // 카드 헤더 + 구분선
    this.add
      .text(cardX + 28, cardY + 36, '📊 익명 투표 (라고 쓰고 실명제)', {
        fontFamily: FONT,
        fontSize: '26px',
        color: KAKAO.textDark,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    card.lineStyle(2, 0xe1e6ec, 1);
    card.lineBetween(cardX + 20, cardY + 66, cardX + cardW - 20, cardY + 66);

    this.add
      .text(GAME_WIDTH / 2, cardY + 150, this.question.q, {
        fontFamily: FONT,
        fontSize: '29px',
        color: KAKAO.textDark,
        wordWrap: { width: cardW - 90 },
        align: 'center',
        lineSpacing: 9,
      })
      .setOrigin(0.5);

    const circled = ['①', '②', '③', '④'];
    const startY = cardY + 300;
    this.question.options.forEach((option, i) => {
      const btn = new Button(this, GAME_WIDTH / 2, startY + i * 126, {
        label: `${circled[i] ?? `${i + 1}.`} ${option}`,
        width: cardW - 60,
        height: 108,
        color: 0xf4f6f9,
        labelColor: KAKAO.textDark,
        strokeColor: 0x9fb0c2,
        fontSize: 25,
        onClick: () => this.choose(i),
      });
      this.buttons.push(btn);
    });

    this.startTimer(M2_VOTE.timeMs(gameState.day), () =>
      this.finishFail('머뭇거리다 투표 시간이 끝났다... "제출 안 한 사람 누구냐"')
    );
  }

  private choose(index: number): void {
    if (this.done) return;
    if (index === this.question.answer) {
      this.finishSuccess('정답! 국어 시간에 안 졸길 잘했다.');
      return;
    }
    // 정답 공개 연출 (초록 = 정답, 빨강 = 내가 고른 오답)
    this.buttons[this.question.answer]?.setColor(COLORS.safe);
    this.buttons[index]?.setColor(COLORS.accent);
    this.finishFail('함정 선지에 낚였다... "이 답변 누구냐, 나와라"');
  }
}
