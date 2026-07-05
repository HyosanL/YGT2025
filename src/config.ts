import type { KakaoPrompt, MainQuestId, VoteQuestion } from './types';

// ─────────────────────────────────────────────
// 화면 / 공통
// ─────────────────────────────────────────────
export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;
export const HP_MAX = 100;

export const FONT = "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Segoe UI', sans-serif";

export const COLORS = {
  bg: 0x1a1a2e,
  panel: 0x16213e,
  panelLight: 0x0f3460,
  accent: 0xe94560,
  safe: 0x4ecca3,
  warn: 0xffb400,
  white: 0xf5f5f5,
  textCss: '#f5f5f5',
  subCss: '#a8b2d1',
  accentCss: '#e94560',
  safeCss: '#4ecca3',
  warnCss: '#ffb400',
} as const;

export function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/** 일차별 난이도 계수 0~1 (튜닝 대상) */
export function difficulty(day: number): number {
  return Math.min(1, 0.3 + day * 0.07);
}

// ─────────────────────────────────────────────
// 메인 퀘스트 배정
// ─────────────────────────────────────────────
/** 벽치기(Q5)가 풀에 포함되는 일차 */
export const WALLPUNCH_UNLOCK_DAY = 10;

// ─────────────────────────────────────────────
// 미니 퀘스트 발생 규칙
// ─────────────────────────────────────────────
export const MINI = {
  /** 하루(메인 퀘스트 1회) 안에서 미니 퀘스트 발생 확률 */
  chance: (day: number): number => Math.min(0.85, 0.3 + day * 0.05),
  /** 하루 최대 발생 횟수 */
  maxPerDay: 2,
  /** 'gameover' = 실패 시 즉시 게임 오버, 'hp' = HP 페널티로 전환 가능 */
  failMode: 'gameover' as 'gameover' | 'hp',
  failHpPenalty: 40,
  /** 첫 번째 인터럽트 지연 (ms 범위) — 메인 퀘스트가 짧아진 만큼 인터럽트도 앞당김 */
  firstDelayMs: [1500, 3000] as const,
  /** 두 번째 인터럽트 추가 지연 (ms 범위) */
  secondDelayMs: [2500, 4500] as const,
} as const;

// ─────────────────────────────────────────────
// Q1. 샤워장에서 몰래 노래 틀기
// ─────────────────────────────────────────────
export const Q1_SHOWER = {
  /** 노래 총 재생 시간 (재생 중일 때만 진행됨) — 판당 12~14초, 선배 조우 4~5회 */
  songMs: 8000,
  /** 샤워 제한 시간 — 조우가 잦아진 만큼 시뮬레이션 기준 여유 ~2초 확보 (운빨 사망 방지) */
  showerTimeMs: (day: number): number => Math.round(lerp(14500, 16500, difficulty(day))),
  /** 선배는 예고 없이 등장한다. 등장 순간부터 버튼을 누를 수 있는 반응 유예 시간
   *  (모바일 터치 반응 한계 고려 — 커튼 등장 보정 후에도 360ms 밑으로 내려가지 않게) */
  reactMs: (day: number): number => Math.round(lerp(650, 420, difficulty(day))),
  /** 선배 체류 시간 범위 — 짧게 치고 빠진다 */
  stayMsRange: (day: number): [number, number] => [
    Math.round(lerp(800, 1100, difficulty(day))),
    Math.round(lerp(1200, 1500, difficulty(day))),
  ],
  /** 선배 등장 간격 범위 — 빨리빨리 돌아온다 */
  gapMsRange: (day: number): [number, number] => [
    Math.round(lerp(1500, 1200, difficulty(day))),
    Math.round(lerp(2500, 2000, difficulty(day))),
  ],
} as const;

// ─────────────────────────────────────────────
// Q2. 복도에서 경례 대신 인사로 받기
// ─────────────────────────────────────────────
export const Q2_HALLWAY = {
  /** 필요 성공 횟수 (3~4회, 일차 비례) */
  targetCount: (day: number): number => Math.min(4, 3 + Math.floor((day - 1) / 8)),
  /** 후배 접근 시간 */
  approachMs: (day: number): number => Math.round(lerp(1400, 900, difficulty(day))),
  /** 경례 후 응답 허용 시간 */
  saluteWindowMs: (day: number): number => Math.round(lerp(1800, 1200, difficulty(day))),
  /** 후배 사이 간격 범위 */
  juniorGapMsRange: (day: number): [number, number] => [
    Math.round(lerp(800, 500, difficulty(day))),
    Math.round(lerp(1400, 900, difficulty(day))),
  ],
  /** 선배 체류 시간 범위 (선배는 예고 없이 등장한다) — 짧게 치고 빠진다 */
  seniorStayMsRange: (day: number): [number, number] => [
    Math.round(lerp(900, 1200, difficulty(day))),
    Math.round(lerp(1300, 1800, difficulty(day))),
  ],
  /** 선배 등장 간격 범위 — 빨리빨리 돌아온다 */
  seniorGapMsRange: (day: number): [number, number] => [
    Math.round(lerp(1600, 1100, difficulty(day))),
    Math.round(lerp(2800, 1900, difficulty(day))),
  ],
  /** 선경례 굴욕 페널티 */
  hpPreemptiveSalute: 10,
  /** 경례 무시(타임아웃) 페널티 */
  hpIgnoreSalute: 5,
  /** 선배도 없는데 후배 경례를 경례로 받아버린 굴욕 페널티 */
  hpWrongSalute: 18,
  /** 선배가 아예 안 나타나는 후배 사이클 비율 (일차가 갈수록 감소) */
  noSeniorChance: (day: number): number => Math.max(0.18, 0.4 - day * 0.015),
} as const;

// ─────────────────────────────────────────────
// Q3. 몰래 결식하고 전자레인지 돌리기
// ─────────────────────────────────────────────
export const Q3_MICROWAVE = {
  /** 조리 완료까지 전자레인지 앞 체류 필요 시간 — 판당 11~16초, 선배 조우 3~5회 */
  cookMs: (day: number): number => Math.round(lerp(5500, 7500, difficulty(day))),
  /** 100% 도달 시 "삐-" 지속 시간 — gap 하한(1300ms)보다 인지+반응 여유만큼 짧아야
   *  '삐- 중 선배 등장' 코인플립 사망이 생기지 않는다 */
  beepMs: 800,
  /** 선배는 예고 없이 등장한다. 등장 순간부터 세탁실로 피할 수 있는 반응 유예 시간 */
  reactMs: (day: number): number => Math.round(lerp(700, 420, difficulty(day))),
  /** 짧게 치고 빠진다 */
  stayMsRange: (day: number): [number, number] => [
    Math.round(lerp(900, 1200, difficulty(day))),
    Math.round(lerp(1300, 1700, difficulty(day))),
  ],
  /** 빨리빨리 돌아온다 (하한은 beep 800ms + 반응 여유를 보장) */
  gapMsRange: (day: number): [number, number] => [
    Math.round(lerp(1600, 1300, difficulty(day))),
    Math.round(lerp(2500, 1900, difficulty(day))),
  ],
  /** 완전소등까지 제한시간 — 소등 전에 "삐-"까지 끝내야 한다.
   *  숨는 시간(선배 조우 기대값)을 감안해 조리 시간 대비 넉넉하되,
   *  세탁실 캠핑은 반드시 실패하는 수준으로 설정 */
  lightsOutMs: (day: number): number => Math.round(lerp(13500, 20000, difficulty(day))),
} as const;

// ─────────────────────────────────────────────
// Q4. 태권도장까지 가기 (탑다운 잠입 — 선배 시선은 CCTV처럼 회전한다)
// ─────────────────────────────────────────────
export const Q4_WALK = {
  /** 도착까지 총 거리 (월드 px) */
  distancePx: (day: number): number => Math.round(lerp(4200, 5800, difficulty(day))),
  /** 걷기 속도 (px/s) — 안전하지만 느리다 */
  walkSpeed: 250,
  /** 구보 속도 (px/s) */
  runSpeed: 500,
  /** 구보 HP 소모 (초당) — 전 구간을 구보로 내달리면 반드시 탈진하는 수치 */
  runHpPerSec: 13,
  /** 걷는 동안 HP 회복 (초당) — 사각지대 걷기의 보상 */
  walkRegenPerSec: 1.5,
  /** 시야에 걸린 채 걷기가 허용되는 유예 (ms) — 이 안에 구보로 전환해야 한다 */
  graceMs: (day: number): number => Math.round(lerp(650, 430, difficulty(day))),
  /** 도로변 선배 배치 간격 (월드 px) */
  seniorSpacingPx: (day: number): number => Math.round(lerp(1500, 1050, difficulty(day))),
  /** CCTV 시야 설정 */
  vision: {
    rangePx: 620,
    halfAngleDeg: 26,
    /** 시선이 왕복하는 주기 */
    sweepPeriodMs: (day: number): number => Math.round(lerp(2800, 2000, difficulty(day))),
    /** 정면 기준 좌우 회전 폭 (도) */
    sweepAmpDeg: 80,
  },
} as const;

// ─────────────────────────────────────────────
// Q5. 옆방 벽 치기 (10일차부터, 순수 운빨)
// ─────────────────────────────────────────────
export const Q5_WALLPUNCH = {
  /** 요구 타수 */
  hits: (day: number): number =>
    Math.min(6, 4 + Math.floor(Math.max(0, day - WALLPUNCH_UNLOCK_DAY) / 4)),
  /** 1회당 선배 확률 */
  seniorChance: (day: number): number =>
    Math.min(0.25, 0.05 + Math.max(0, day - WALLPUNCH_UNLOCK_DAY) * 0.01),
  /** 결과 공개 전 정적 시간 범위 (ms) */
  suspenseMsRange: [300, 800] as const,
} as const;

// ─────────────────────────────────────────────
// M1. 카톡 답장하기 (타자)
// ─────────────────────────────────────────────
export const M1_KAKAO = {
  /** 제한 시간 (고정 11초 — 시간이 이 게임의 전부) */
  timeMs: 11000,
  /** 붉은 펄스 시작 임계 (남은 ms) */
  panicMs: 4000,
  /** 일차별 문장 티어: 길수록 높은 티어 */
  tier: (day: number): number => Math.min(2, Math.floor((day - 1) / 5)),
  prompts: [
    // tier 0 — 짧음
    { msg: '야 지금 어디냐', reply: '생활관입니다', tier: 0 },
    { msg: '내일 아침 점호 몇 시지', reply: '6시입니다', tier: 0 },
    { msg: '답장 왜 이렇게 늦냐', reply: '죄송합니다', tier: 0 },
    { msg: '오늘 훈련 어땠냐', reply: '힘들었습니다', tier: 0 },
    { msg: '지금 뭐 하냐', reply: '공부 중입니다', tier: 0 },
    // tier 1 — 중간
    { msg: '10분 뒤에 생활관 앞으로 와라', reply: '네 알겠습니다', tier: 1 },
    { msg: '아까 복도에서 왜 인사 안 했냐', reply: '죄송합니다 못 봤습니다', tier: 1 },
    { msg: '내 관물대에서 뭐 가져갔냐', reply: '아닙니다 안 가져갔습니다', tier: 1 },
    { msg: '지금 바로 내려올 수 있냐', reply: '지금 바로 가겠습니다', tier: 1 },
    { msg: '어제 소등 후에 뭐 했냐', reply: '바로 취침했습니다', tier: 1 },
    // tier 2 — 김
    { msg: '단체 채팅방에 올라온 공지 확인했냐', reply: '죄송합니다 지금 확인했습니다', tier: 2 },
    { msg: '이번 주말 외박 신청서 왜 안 냈냐', reply: '내일 아침에 바로 제출하겠습니다', tier: 2 },
    { msg: '후배들 군기가 빠진 것 같지 않냐', reply: '제가 잘 챙기도록 하겠습니다', tier: 2 },
    { msg: '샤워장에서 노랫소리 들렸다는데 아는 거 있냐', reply: '아닙니다 저는 모르는 일입니다', tier: 2 },
    { msg: '내일 태권도 시합 준비는 잘 되고 있냐', reply: '네 열심히 준비하고 있습니다', tier: 2 },
  ] as KakaoPrompt[],
} as const;

// ─────────────────────────────────────────────
// M2. 투표하기 (함정 선지 독해)
// ─────────────────────────────────────────────
export const M2_VOTE = {
  timeMs: (day: number): number => Math.max(7000, 11500 - day * 150),
  level: (day: number): number => Math.min(3, 1 + Math.floor(day / 5)),
  questions: [
    {
      level: 1,
      q: '특강 만족도 조사 — 당신은 졸지 않았다.\n올바른 선지는?',
      options: ['특강 시간에 졸지 않은 것 같지 않다', '특강 시간에 졸지 않았다고 하기 어렵지 않다'],
      answer: 1,
    },
    {
      level: 1,
      q: '급식 만족도 조사 — 당신은 맛있게 먹었다.\n올바른 선지는?',
      options: ['맛이 없지 않았다', '맛이 있지 않은 편이었다'],
      answer: 0,
    },
    {
      level: 1,
      q: '체력 단련 설문 — 당신은 참여했다.\n올바른 선지는?',
      options: ['참여하지 않은 적이 없지 않다', '참여하지 않은 적이 없다'],
      answer: 1,
    },
    {
      level: 2,
      q: '생활관 청소 상태 점검 — 청소를 했다.\n올바른 선지는?',
      options: [
        '청소를 하지 않았다는 것을 부정하기 어렵다',
        '청소를 하지 않았다는 것을 부정할 수 없지 않다',
        '청소를 하지 않았다고 말할 수 없다',
      ],
      answer: 2,
    },
    {
      level: 2,
      q: '군가 교육 설문 — 가사를 다 외웠다.\n올바른 선지는?',
      options: [
        '가사를 외우지 못했다고 하기 어렵다',
        '가사를 외우지 못한 것이 아니라고 하기 어렵다',
        '가사를 외웠다고 하기 어렵지 않은 것도 아니다',
      ],
      answer: 0,
    },
    {
      level: 2,
      q: '아침 점호 설문 — 지각하지 않았다.\n올바른 선지는?',
      options: [
        '지각을 안 한 것이 아니다',
        '지각을 했다고 볼 수 없다',
        '지각을 안 했다고 볼 수 없다',
      ],
      answer: 1,
    },
    {
      level: 3,
      q: '훈육 설문 — 벌점을 받은 적이 없다.\n올바른 선지는?',
      options: [
        '벌점을 받지 않았다는 것이 사실이 아니라고 할 수 없지 않다',
        '벌점을 받지 않은 적이 없다는 것을 부정할 수 없다',
        '벌점을 받았다는 것을 부정하지 못할 이유가 없지 않다',
      ],
      answer: 2,
    },
    {
      level: 3,
      q: '독서 활동 조사 — 이번 달 책을 읽었다.\n올바른 선지는?',
      options: [
        '책을 읽지 않았다는 주장이 거짓이 아닌 것은 아니다',
        '책을 읽지 않았다는 주장이 거짓이라고 할 수 없다',
        '책을 읽었다는 주장이 참이 아니지 않다고 할 수 없다',
      ],
      answer: 0,
    },
    {
      level: 3,
      q: '보안 교육 설문 — 규정을 위반하지 않았다.\n올바른 선지는?',
      options: [
        '규정을 위반하지 않은 것이 아님을 부정할 수 없다',
        '규정을 위반했다는 것이 사실이 아니지 않다',
        '규정을 위반했다는 것이 사실이라고 할 수 없다',
      ],
      answer: 2,
    },
    {
      level: 3,
      q: '동아리 활동 조사 — 활동에 빠진 적이 있다.\n올바른 선지는?',
      options: [
        '활동에 빠진 적이 없다고 하면 거짓이 아니다',
        '활동에 빠진 적이 없지 않다',
        '활동에 빠졌다는 것은 사실이 아니지 않은 것이 아니다',
      ],
      answer: 1,
    },
  ] as VoteQuestion[],
} as const;

// ─────────────────────────────────────────────
// M3. 단체 채팅방 사진 고르기
// ─────────────────────────────────────────────
export const M3_PHOTO = {
  roomTitle: '너네 장난하냐?',
  seniorMsg: '내가 이렇게 방 정리하라고 시켰냐?',
  chooseInstruction: '제대로 정리된 관물대를 고르세요',
  spotInstruction: '잘못된 부분을 터치하세요',
  /** 고르기 모드 제한 시간 */
  chooseTimeMs: 4500,
  /** 틀린그림찾기 모드 제한 시간 */
  spotTimeMs: 7000,
  /** 고르기 모드 선택지 수 (일차가 늘면 6장) */
  chooseCount: (day: number): number => (day >= 12 ? 6 : 4),
} as const;

// ─────────────────────────────────────────────
// 퀘스트 메타 (이름, 이모지, 한 줄 팁)
// 리듬감을 위해 인트로 대사 대신 짧은 팁 한 줄만 보여주고 자동 시작한다
// ─────────────────────────────────────────────
export const QUEST_META: Record<MainQuestId, { title: string; emoji: string; tip: string }> = {
  shower: {
    title: '샤워장에서 몰래 노래 틀기',
    emoji: '🚿',
    tip: '노래는 자동 재생 — 선배가 나타나면 ⏸ 꾹! 나갈 때까지 유지',
  },
  hallway: {
    title: '복도에서 경례 대신 인사로 받기',
    emoji: '🫡',
    tip: '후배 경례는 🙇 인사로 받아야 카운트 — 선배가 보이면 🫡 경례로!',
  },
  microwave: {
    title: '몰래 결식하고 전자레인지 돌리기',
    emoji: '🍜',
    tip: '선배 등장 즉시 세탁실로! 단, 완전소등 전에 "삐-"까지 끝내야 한다',
  },
  walk: {
    title: '태권도장까지 걸어가기',
    emoji: '🥋',
    tip: '선배 시야(부채꼴)에 걸린 채 걸으면 발각! 꾹 눌러 구보로 돌파 (HP 소모), 사각지대에선 걸어서 회복',
  },
  wallpunch: {
    title: '옆방(1학년 방) 벽 치기',
    emoji: '💥',
    tip: '벽을 쳐라. 벽 너머에 선배가 없기를 빌어라. 되돌릴 수 없다.',
  },
};

/** 미니 퀘스트 씬 키 목록 */
export const MINI_QUEST_KEYS = ['kakao', 'vote', 'photo'] as const;
