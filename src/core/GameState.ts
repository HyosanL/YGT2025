import { HP_MAX } from '../config';
import type { MainQuestId, SaveData, Settings } from '../types';

const STORAGE_KEY = 'ygt2025_save_v1';

const DEFAULT_SETTINGS: Settings = { mute: false, nickname: '' };

/**
 * 게임 전역 상태 싱글턴 (localStorage 동기화).
 * HP는 하루 단위 자원 — 매일 아침(startDay) 100으로 리셋.
 */
class GameStateImpl {
  day = 1;
  hp = HP_MAX;
  currentQuestId: MainQuestId | null = null;
  lastQuestId: MainQuestId | null = null;
  bestDay = 0;
  totalPlayMs = 0;
  settings: Settings = { ...DEFAULT_SETTINGS };

  /** 현재 플레이 구간 시작 시각 (0이면 구간 아님) */
  private segmentStart = 0;

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<SaveData>;
      this.day = typeof data.day === 'number' && data.day >= 1 ? Math.floor(data.day) : 1;
      this.hp = typeof data.hp === 'number' ? data.hp : HP_MAX;
      this.currentQuestId = data.currentQuestId ?? null;
      this.lastQuestId = data.lastQuestId ?? null;
      this.bestDay = typeof data.bestDay === 'number' ? data.bestDay : 0;
      this.totalPlayMs = typeof data.totalPlayMs === 'number' ? data.totalPlayMs : 0;
      this.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
    } catch {
      // 저장 데이터가 깨졌으면 무시하고 새로 시작
    }
  }

  save(): void {
    const data: SaveData = {
      day: this.day,
      hp: this.hp,
      currentQuestId: this.currentQuestId,
      lastQuestId: this.lastQuestId,
      bestDay: this.bestDay,
      totalPlayMs: this.totalPlayMs,
      settings: this.settings,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // 저장 불가 환경(시크릿 모드 등)은 조용히 무시
    }
  }

  /** 새 도전 시작: 1일차부터 */
  newRun(): void {
    this.day = 1;
    this.hp = HP_MAX;
    this.currentQuestId = null;
    this.lastQuestId = null;
    this.totalPlayMs = 0;
    this.segmentStart = 0;
    this.save();
  }

  /** 하루 시작: HP 리셋 + 오늘의 퀘스트 기록 + 플레이 시간 측정 시작 */
  startDay(questId: MainQuestId): void {
    this.hp = HP_MAX;
    this.currentQuestId = questId;
    this.segmentStart = Date.now();
    this.save();
  }

  private foldSegment(): void {
    if (this.segmentStart > 0) {
      this.totalPlayMs += Date.now() - this.segmentStart;
      this.segmentStart = 0;
    }
  }

  /** 메인 퀘스트 성공 → 다음 날로 */
  completeDay(): void {
    this.foldSegment();
    this.bestDay = Math.max(this.bestDay, this.day);
    this.lastQuestId = this.currentQuestId;
    this.currentQuestId = null;
    this.day += 1;
    this.save();
  }

  /** 게임 오버 처리 (점수 = 발각 당한 날의 일차) */
  gameOver(): void {
    this.foldSegment();
    this.bestDay = Math.max(this.bestDay, this.day);
    this.save();
  }

  /**
   * HP 감소. 0 이하가 되면 true(사망)를 반환.
   * 소수 감소(초당 드레인)도 허용하므로 표시할 때는 ceil/floor 사용.
   */
  damage(amount: number): boolean {
    this.hp = Math.max(0, this.hp - amount);
    return this.hp <= 0;
  }

  setNickname(nickname: string): void {
    this.settings.nickname = nickname.slice(0, 12);
    this.save();
  }

  setMute(mute: boolean): void {
    this.settings.mute = mute;
    this.save();
  }
}

export const gameState = new GameStateImpl();
gameState.load();
