import { COLORS, M2_VOTE } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import type { VoteQuestion } from '../../types';
import { pick, shuffle } from '../../utils/rng';
import {
  drawKakaoAuthor,
  drawKakaoNotice,
  drawKakaoVoteCard,
  type VoteOptionHandle,
} from '../../ui/kakao';
import { BaseMiniScene, PANEL } from './BaseMiniScene';

/**
 * M2. 투표하기 — 다중 부정문으로 꼬인 선지 중 의미상 올바른 것을 제한 시간 안에 고른다.
 * 화면은 실제 카카오톡에서 투표를 눌렀을 때 뜨는 **'상세보기' 페이지**를 그대로 옮겼다:
 * 흰 전체화면 + 가운데 정렬 제목 + 작성자 행 + 종료 안내 띠 + 흰 투표 카드(원형 라디오 + [투표하기]).
 * 실제 앱처럼 선지를 고른 뒤 [투표하기]를 눌러야 제출된다.
 * 매판 정답 후보 중 1개 + 함정 중 (N-1)개를 뽑아 순서를 섞는다 — 답 암기 불가.
 */
export class VoteScene extends BaseMiniScene {
  private question!: VoteQuestion;
  private answerIndex = 0;
  private selected = -1;
  private handles: VoteOptionHandle[] = [];

  constructor() {
    super({ key: 'vote' });
  }

  create(): void {
    this.setupOverlay('상세보기', 'kakaoPage');
    this.selected = -1;
    this.handles = [];

    const level = M2_VOTE.level(gameState.day);
    const pool = M2_VOTE.questions.filter((q) => q.level === level);
    this.question = pick(pool.length > 0 ? pool : M2_VOTE.questions);

    const optionCount = M2_VOTE.optionCount(this.question.level);
    const correct = pick(this.question.corrects);
    const wrongs = shuffle(this.question.wrongs).slice(0, optionCount - 1);
    const options = shuffle([correct, ...wrongs]);
    this.answerIndex = options.indexOf(correct);

    audio.ding();

    let y = this.room.top + 6;
    y += drawKakaoAuthor(this, PANEL.x, y, PANEL.w, {
      name: '옹성오',
      avatarKey: 'avatar_ong',
      avatarEmoji: '😤',
    });
    y += drawKakaoNotice(this, PANEL.x, y, PANEL.w, '투표가 1일 후에 종료됩니다');

    // 주제(선배가 던진 말)를 투표 제목 위에 한 줄로 얹어 맥락을 준다
    const card = drawKakaoVoteCard(this, PANEL.x + 20, y + 4, PANEL.w - 40, {
      question: `${this.question.msg}\n\n${this.question.q}`,
      options,
      onSelect: (i) => this.select(i),
      onSubmit: () => this.submit(),
    });
    this.handles = card.handles;
    this.setSubmitEnabled = card.setSubmitEnabled;

    this.startTimer(M2_VOTE.timeMs(gameState.day), () =>
      this.finishFail('머뭇거리다 투표 시간이 끝났다... "제출 안 한 사람 누구냐"')
    );
  }

  private setSubmitEnabled: (on: boolean) => void = () => undefined;

  private select(index: number): void {
    if (this.done) return;
    this.selected = index;
    this.handles.forEach((h, i) => h.setSelected(i === index));
    this.setSubmitEnabled(true);
    audio.tick();
  }

  private submit(): void {
    if (this.done || this.selected < 0) return;
    if (this.selected === this.answerIndex) {
      this.finishSuccess('정답! 국어 시간에 안 졸길 잘했다.');
      return;
    }
    // 정답 공개 (초록 = 정답, 빨강 = 내가 고른 오답)
    this.handles[this.answerIndex]?.mark(COLORS.safe);
    this.handles[this.selected]?.mark(COLORS.accent);
    this.finishFail('함정 선지에 낚였다... "이 답변 누구냐, 나와라"');
  }
}
