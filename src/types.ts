export type MainQuestId = 'shower' | 'hallway' | 'microwave' | 'walk' | 'wallpunch';
export type MiniQuestId = 'kakao' | 'vote' | 'photo';

export interface Settings {
  mute: boolean;
  nickname: string;
}

export interface SaveData {
  day: number;
  hp: number;
  /** 목숨 (⅓ 단위 정수, 3 = 하트 1개) */
  livesThirds?: number;
  currentQuestId: MainQuestId | null;
  lastQuestId: MainQuestId | null;
  bestDay: number;
  /** 최고 기록의 생존 시간 (같은 일차 동률 판정용) */
  bestPlayMs?: number;
  totalPlayMs: number;
  settings: Settings;
}

export interface LeaderboardEntry {
  nickname: string;
  days: number;
  play_ms: number;
  created_at?: string;
}

export interface QuestOutcome {
  success: boolean;
  reason: string;
}

export interface DialogueLine {
  name: string;
  text: string;
}

export interface KakaoPrompt {
  /** 선배가 보내는 메시지 */
  msg: string;
  /** 플레이어가 그대로 입력해야 하는 답장 */
  reply: string;
  /** 난이도 티어 (0=짧음, 1=중간, 2=김) */
  tier: number;
}

export interface VoteQuestion {
  /** 부정 중첩 난이도 (1~3) */
  level: number;
  /** 옹성오가 보내는 상황 메시지 (투표 주제) */
  msg: string;
  /** 투표 카드에 표시되는 전제 + 질문 */
  q: string;
  /** 의미상 올바른 선지 후보들 — 매판 1개가 무작위 출제 (답 암기 방지) */
  corrects: string[];
  /** 함정 선지 후보들 — 매판 (선지 수 - 1)개 무작위 출제 */
  wrongs: string[];
}

export type LockerFlaw = 'tilt-blanket' | 'open-drawer' | 'sock' | 'crooked-hanger';

export interface MiniSceneData {
  returnTo: string;
}

export interface ResultSceneData {
  success: boolean;
  reason: string;
}
