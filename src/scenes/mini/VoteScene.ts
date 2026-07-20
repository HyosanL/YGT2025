import { COLORS, FONT, M2_VOTE } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import type { VoteQuestion } from '../../types';
import { Button } from '../../ui/Button';
import { pick, shuffle } from '../../utils/rng';
import { drawIncoming } from '../../ui/kakao';
import { BaseMiniScene, KAKAO, PANEL } from './BaseMiniScene';

/**
 * M2. 투표하기 — 다중 부정문으로 꼬인 선지 중 의미상 올바른 것을 제한 시간 안에 선택.
 * 카톡 단체방의 투표 카드 디자인: 옹성오의 주제 메시지 + 흰 투표 카드.
 * 매판 정답 후보 중 1개 + 함정 중 (N-1)개를 뽑아 순서를 섞는다 — 답 암기 불가.
 */
export class VoteScene extends BaseMiniScene {
  private question!: VoteQuestion;
  private answerIndex = 0;
  private buttons: Button[] = [];

  constructor() {
    super({ key: 'vote' });
  }

  create(): void {
    this.roomMemberCount = 214;
    this.roomPlaceholder = '메시지 입력';
    this.setupOverlay('21기 생도대', 'kakao');
    this.buttons = [];

    const level = M2_VOTE.level(gameState.day);
    const pool = M2_VOTE.questions.filter((q) => q.level === level);
    this.question = pick(pool.length > 0 ? pool : M2_VOTE.questions);

    // 선지 구성: 정답 후보 1개 + 함정 (N-1)개, 순서 셔플
    const optionCount = M2_VOTE.optionCount(this.question.level);
    const correct = pick(this.question.corrects);
    const wrongs = shuffle(this.question.wrongs).slice(0, optionCount - 1);
    const options = shuffle([correct, ...wrongs]);
    this.answerIndex = options.indexOf(correct);

    audio.ding();

    // ── 옹성오 선배 메시지 (프로필 + 이름 + 흰 말풍선) ──
    const msgH = drawIncoming(this, {
      x: PANEL.x + 24,
      y: this.room.top,
      name: '옹성오',
      avatarKey: 'avatar_ong',
      avatarEmoji: '😤',
      text: this.question.msg,
      maxWidth: 400,
      fontSize: 24,
      time: '오후 10:02',
    });

    // ── 투표 카드 (카톡 투표 말풍선 — 프로필 아래에 이어 붙는다) ──
    const cardX = PANEL.x + 108;
    const cardY = this.room.top + msgH - 8;
    const cardW = PANEL.w - 148;
    // 선지 수에 맞춰 카드 높이를 정확히 잡아 입력바를 침범하지 않게 한다
    const optionGap = 96;
    const optionH = 88;
    const optionTop = 200;
    const cardH = optionTop + (optionCount - 1) * optionGap + optionH / 2 + 36;
    const card = this.add.graphics();
    card.fillStyle(KAKAO.bubbleWhite, 1);
    card.fillRoundedRect(cardX, cardY, cardW, cardH, 14);
    // 카드 헤더 + 구분선
    this.add
      .text(cardX + 24, cardY + 34, '📊 익명 투표 (라고 쓰고 실명제)', {
        fontFamily: FONT,
        fontSize: '24px',
        color: KAKAO.textDark,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    card.lineStyle(2, 0xe1e6ec, 1);
    card.lineBetween(cardX + 18, cardY + 62, cardX + cardW - 18, cardY + 62);

    this.add
      .text(cardX + cardW / 2, cardY + 108, this.question.q, {
        fontFamily: FONT,
        fontSize: '25px',
        color: KAKAO.textDark,
        wordWrap: { width: cardW - 70 },
        align: 'center',
        lineSpacing: 9,
      })
      .setOrigin(0.5);

    const circled = ['①', '②', '③', '④'];
    const startY = cardY + optionTop;
    options.forEach((option, i) => {
      const btn = new Button(this, cardX + cardW / 2, startY + i * optionGap, {
        label: `${circled[i] ?? `${i + 1}.`} ${option}`,
        width: cardW - 48,
        height: optionH,
        color: 0xf4f6f9,
        labelColor: KAKAO.textDark,
        fontSize: 23,
        wrapWidth: cardW - 118,
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
    if (index === this.answerIndex) {
      this.finishSuccess('정답! 국어 시간에 안 졸길 잘했다.');
      return;
    }
    // 정답 공개 연출 (초록 = 정답, 빨강 = 내가 고른 오답)
    this.buttons[this.answerIndex]?.setColor(COLORS.safe);
    this.buttons[index]?.setColor(COLORS.accent);
    this.finishFail('함정 선지에 낚였다... "이 답변 누구냐, 나와라"');
  }
}
