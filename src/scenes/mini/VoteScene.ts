import { COLORS, FONT, GAME_WIDTH, M2_VOTE } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import type { VoteQuestion } from '../../types';
import { Button } from '../../ui/Button';
import { pick } from '../../utils/rng';
import { BaseMiniScene, PANEL } from './BaseMiniScene';

/**
 * M2. 투표하기 — 다중 부정문으로 꼬인 선지 중 의미상 올바른 것을 제한 시간 안에 선택.
 */
export class VoteScene extends BaseMiniScene {
  private question!: VoteQuestion;
  private buttons: Button[] = [];

  constructor() {
    super({ key: 'vote' });
  }

  create(): void {
    this.setupOverlay('🗳️ 긴급 설문 도착!');
    this.buttons = [];

    const level = M2_VOTE.level(gameState.day);
    const pool = M2_VOTE.questions.filter((q) => q.level === level);
    this.question = pick(pool.length > 0 ? pool : M2_VOTE.questions);

    audio.ding();

    this.add
      .text(GAME_WIDTH / 2, PANEL.y + 165, '⚠️ 무기명이라고 대충 내면 걸린다', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5);

    const qBg = this.add.graphics();
    qBg.fillStyle(0x0d1424, 1);
    qBg.fillRoundedRect(PANEL.x + 30, PANEL.y + 200, PANEL.w - 60, 220, 16);
    this.add
      .text(GAME_WIDTH / 2, PANEL.y + 310, this.question.q, {
        fontFamily: FONT,
        fontSize: '32px',
        color: COLORS.textCss,
        wordWrap: { width: PANEL.w - 120 },
        align: 'center',
        lineSpacing: 10,
      })
      .setOrigin(0.5);

    const startY = PANEL.y + 500;
    this.question.options.forEach((option, i) => {
      const btn = new Button(this, GAME_WIDTH / 2, startY + i * 150, {
        label: `${i + 1}. ${option}`,
        width: PANEL.w - 80,
        height: 124,
        fontSize: 27,
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
    // 정답 공개 연출
    this.buttons[this.question.answer]?.setColor(COLORS.safe);
    this.buttons[index]?.setColor(COLORS.accent);
    this.finishFail('함정 선지에 낚였다... "이 답변 누구냐, 나와라"');
  }
}
