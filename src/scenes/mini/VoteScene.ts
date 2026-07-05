import { COLORS, FONT, GAME_WIDTH, M2_VOTE } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import type { VoteQuestion } from '../../types';
import { Button } from '../../ui/Button';
import { pick, shuffle } from '../../utils/rng';
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
    this.setupOverlay('21기 생도대 단체방', 'kakao');
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

    // ── 옹성오 선배 메시지 (좌측 흰 버블 — 투표 주제) ──
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
    const bubbleW = Math.min(500, this.question.msg.length * 23 + 56);
    const bubble = this.add.graphics();
    bubble.fillStyle(KAKAO.bubbleWhite, 1);
    bubble.fillRoundedRect(PANEL.x + 108, msgY - 30, bubbleW, 58, 16);
    bubble.fillTriangle(PANEL.x + 108, msgY - 22, PANEL.x + 96, msgY - 10, PANEL.x + 108, msgY + 2);
    this.add
      .text(PANEL.x + 108 + bubbleW / 2, msgY - 1, this.question.msg, {
        fontFamily: FONT,
        fontSize: '23px',
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
    options.forEach((option, i) => {
      const btn = new Button(this, GAME_WIDTH / 2, startY + i * 126, {
        label: `${circled[i] ?? `${i + 1}.`} ${option}`,
        width: cardW - 60,
        height: 108,
        color: 0xf4f6f9,
        labelColor: KAKAO.textDark,
        strokeColor: 0x9fb0c2,
        fontSize: 23,
        wrapWidth: cardW - 130,
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
