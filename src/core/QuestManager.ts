import { MINI, MINI_QUEST_KEYS, WALLPUNCH_UNLOCK_DAY } from '../config';
import type { MainQuestId, MiniQuestId } from '../types';
import { chance, pick, randRange } from '../utils/rng';
import { gameState } from './GameState';

const BASE_POOL: MainQuestId[] = ['shower', 'hallway', 'microwave', 'walk'];

/**
 * 메인 퀘스트 선택/순환과 미니 퀘스트 발생 판정.
 */
class QuestManagerImpl {
  /** 오늘의 메인 퀘스트 선택 — 전날과 중복 금지, 10일차부터 벽치기 포함 */
  pickQuestForDay(day: number): MainQuestId {
    const pool: MainQuestId[] =
      day >= WALLPUNCH_UNLOCK_DAY ? [...BASE_POOL, 'wallpunch'] : [...BASE_POOL];
    const candidates = pool.filter((q) => q !== gameState.lastQuestId);
    return pick(candidates.length > 0 ? candidates : pool);
  }

  /**
   * 오늘 메인 퀘스트 중 미니 퀘스트가 발생할 시점(ms 지연) 목록을 계획.
   * 발생 확률은 일차에 비례, 하루 최대 MINI.maxPerDay회.
   */
  planMiniTriggers(day: number): number[] {
    const delays: number[] = [];
    const p = MINI.chance(day);
    if (chance(p)) {
      const first = randRange(MINI.firstDelayMs);
      delays.push(first);
      if (MINI.maxPerDay >= 2 && chance(p)) {
        delays.push(first + randRange(MINI.secondDelayMs));
      }
    }
    return delays;
  }

  /** 발생할 미니 퀘스트 종류 선택 */
  pickMini(): MiniQuestId {
    return pick(MINI_QUEST_KEYS);
  }
}

export const questManager = new QuestManagerImpl();
