import { HP_MAX, LIFE_UNITS, LIVES_MAX, WEEKLY_BONUS_DAYS } from '../config';
import type { MainQuestId, SaveData, Settings } from '../types';

/** completeDay 결과 — 주간 보너스 지급 여부를 호출측(결과 화면)에 알린다 */
export interface DayCompletion {
  /** 이번에 클리어한 일차가 주간 보너스 주기(7·14·21…)에 해당했는지 */
  weeklyBonusDue: boolean;
  /** 실제로 하트 1칸이 지급됐는지 (이미 가득이면 false) */
  weeklyBonusGranted: boolean;
}

const STORAGE_KEY = 'ygt2025_save_v1';

const DEFAULT_SETTINGS: Settings = {
  mute: false,
  nickname: '',
  volMaster: 10,
  volBgm: 10,
  volSfx: 10,
};

/**
 * 게임 전역 상태 싱글턴 (localStorage 동기화).
 * HP는 하루 단위 자원 — 매일 아침(startDay) 100으로 리셋.
 */
class GameStateImpl {
  day = 1;
  hp = HP_MAX;
  /** 목숨 (⅓ 단위 정수 — LIFE_UNITS(3) = 하트 1개, 최대 LIVES_MAX*3 = 9).
   *  새 판은 1칸(3)으로 시작. 벽치기 성공 +3(1칸), 미니 퀘스트 성공 +1(⅓칸), 실패 -3(1칸).
   *  사망 시 1칸 소모 후 조금이라도 남으면 부활. */
  livesUnits = LIFE_UNITS;
  currentQuestId: MainQuestId | null = null;
  lastQuestId: MainQuestId | null = null;
  bestDay = 0;
  /** 최고 기록의 생존 시간 — 같은 일차면 오래 버틴 쪽이 신기록 */
  bestPlayMs = 0;
  totalPlayMs = 0;
  settings: Settings = { ...DEFAULT_SETTINGS };
  /** 연습 모드 — 게임설명에서 퀘스트 체험. 목숨/기록/저장에 영향 없음 (비저장) */
  practiceMode = false;

  /** 현재 플레이 구간 시작 시각 (0이면 구간 아님) */
  private segmentStart = 0;
  /** 플레이 시계 홀드 카운트 (일시정지/백그라운드) — 0일 때만 시간이 흐른다 */
  private clockHolds = 0;

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<SaveData>;
      this.day = typeof data.day === 'number' && data.day >= 1 ? Math.floor(data.day) : 1;
      this.hp = typeof data.hp === 'number' ? data.hp : HP_MAX;
      // 구버전 저장 단위(⅙/⅓) → ⅕ 단위 마이그레이션 (하트 개수 비율 유지)
      const rawUnits =
        typeof data.livesUnits === 'number'
          ? data.livesUnits
          : typeof data.livesSixths === 'number'
            ? Math.round((data.livesSixths / 6) * LIFE_UNITS)
            : typeof data.livesThirds === 'number'
              ? Math.round((data.livesThirds / 3) * LIFE_UNITS)
              : LIFE_UNITS;
      this.livesUnits = Math.max(0, Math.min(LIVES_MAX * LIFE_UNITS, Math.floor(rawUnits)));
      this.currentQuestId = data.currentQuestId ?? null;
      this.lastQuestId = data.lastQuestId ?? null;
      this.bestDay = typeof data.bestDay === 'number' ? data.bestDay : 0;
      this.bestPlayMs = typeof data.bestPlayMs === 'number' ? data.bestPlayMs : 0;
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
      livesUnits: this.livesUnits,
      currentQuestId: this.currentQuestId,
      lastQuestId: this.lastQuestId,
      bestDay: this.bestDay,
      bestPlayMs: this.bestPlayMs,
      totalPlayMs: this.totalPlayMs,
      settings: this.settings,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // 저장 불가 환경(시크릿 모드 등)은 조용히 무시
    }
  }

  /** 새 도전 시작: 1일차부터, 목숨 1칸 */
  newRun(): void {
    this.day = 1;
    this.hp = HP_MAX;
    this.livesUnits = LIFE_UNITS;
    this.currentQuestId = null;
    this.lastQuestId = null;
    this.totalPlayMs = 0;
    this.segmentStart = 0;
    this.clockHolds = 0; // 혹시 남아 있던 홀드 정리 (안전장치)
    this.save();
  }

  /** 연습 시작 — 선택한 일차 난이도/HP로 세팅 (저장하지 않음, 기록·목숨 무관) */
  startPractice(day = 1): void {
    this.practiceMode = true;
    this.day = Math.max(1, Math.floor(day));
    this.hp = HP_MAX;
  }

  /** 연습 종료 — 타이틀 진입 시에도 항상 호출해 잔여 플래그를 정리한다 */
  endPractice(): void {
    this.practiceMode = false;
  }

  /** 하루 시작: HP 리셋 + 오늘의 퀘스트 기록 + 플레이 시간 측정 시작 */
  startDay(questId: MainQuestId): void {
    this.hp = HP_MAX;
    this.currentQuestId = questId;
    this.segmentStart = this.clockHolds === 0 ? Date.now() : 0;
    this.save();
  }

  private foldSegment(): void {
    if (this.segmentStart > 0) {
      this.totalPlayMs += Date.now() - this.segmentStart;
      this.segmentStart = 0;
    }
  }

  /**
   * 플레이 시계 정지 (일시정지 메뉴/백그라운드 전환).
   * 벽시계 기반 생존시간이 탭을 떠난 사이에 불어나는 것을 막는다.
   */
  holdClock(): void {
    if (this.clockHolds === 0) this.foldSegment();
    this.clockHolds += 1;
  }

  /** 플레이 시계 재개 — 모든 홀드가 풀리면 이어서 측정 */
  releaseClock(): void {
    this.clockHolds = Math.max(0, this.clockHolds - 1);
    if (this.clockHolds === 0 && this.currentQuestId && this.segmentStart === 0) {
      this.segmentStart = Date.now();
    }
  }

  /**
   * 메인 퀘스트 성공 → 다음 날로.
   * 7일차를 끝내고 8일차로 넘어갈 때처럼 주기(WEEKLY_BONUS_DAYS)의 배수 일차를
   * 클리어하면 '주간 보너스'로 하트 1칸을 덤으로 지급한다.
   */
  completeDay(): DayCompletion {
    this.foldSegment();
    this.bestDay = Math.max(this.bestDay, this.day);
    this.lastQuestId = this.currentQuestId;
    this.currentQuestId = null;
    const clearedDay = this.day;
    this.day += 1;

    const weeklyBonusDue = clearedDay % WEEKLY_BONUS_DAYS === 0;
    // addLifeUnits는 가득 차 있으면 false를 반환한다 (그리고 내부에서 save 호출)
    const weeklyBonusGranted = weeklyBonusDue && this.addLifeUnits(LIFE_UNITS);

    this.save();
    return { weeklyBonusDue, weeklyBonusGranted };
  }

  /**
   * 게임 오버 처리 (점수 = 발각 당한 날의 일차).
   * 신기록 여부를 반환 — 같은 일차면 오래 버틴(totalPlayMs 긴) 쪽이 신기록.
   */
  gameOver(): boolean {
    this.foldSegment();
    const isBest =
      this.day > this.bestDay ||
      (this.day === this.bestDay && this.totalPlayMs > this.bestPlayMs);
    if (isBest) {
      this.bestDay = this.day;
      this.bestPlayMs = this.totalPlayMs;
    }
    this.save();
    return isBest;
  }

  /**
   * HP 감소. 0 이하가 되면 true(사망)를 반환.
   * 소수 감소(초당 드레인)도 허용하므로 표시할 때는 ceil/floor 사용.
   */
  damage(amount: number): boolean {
    this.hp = Math.max(0, this.hp - amount);
    return this.hp <= 0;
  }

  /** HP 회복 (상한 HP_MAX) — 걷기 회복 등 초당 드레인의 역방향 */
  heal(amount: number): void {
    this.hp = Math.min(HP_MAX, this.hp + amount);
  }

  // ── 목숨 ─────────────────────────────────────

  /** 목숨 추가 (⅕ 단위). 이미 가득이면 false */
  addLifeUnits(units: number): boolean {
    const max = LIVES_MAX * LIFE_UNITS;
    if (this.livesUnits >= max) return false;
    this.livesUnits = Math.min(max, this.livesUnits + units);
    this.save();
    return true;
  }

  /** 목숨 차감 (⅕ 단위) — 차감 후에도 살아 있으면 true (0이면 사망) */
  deductLifeUnits(units: number): boolean {
    this.livesUnits = Math.max(0, this.livesUnits - units);
    this.save();
    return this.livesUnits > 0;
  }

  /**
   * 사망 처리 — 목숨 1칸(LIFE_UNITS=3)을 소모하고, 소모 후 **조금이라도 남아 있으면**
   * 부활(true). 예: 4/3칸(4단위) → ⅓칸(1단위) 남으니 부활, 1칸(3) → 0 남아 게임오버.
   * 죽기 전까지 버틴 시간은 리더보드 생존시간에 합산해 둔다.
   */
  tryRevive(): boolean {
    this.foldSegment();
    this.livesUnits = Math.max(0, this.livesUnits - LIFE_UNITS);
    this.save();
    return this.livesUnits > 0;
  }

  setNickname(nickname: string): void {
    this.settings.nickname = nickname.slice(0, 12);
    this.save();
  }

  setMute(mute: boolean): void {
    this.settings.mute = mute;
    this.save();
  }

  /** 볼륨 설정 (0~10) — 호출측에서 audio.applyVolumes()로 반영 */
  setVolume(kind: 'master' | 'bgm' | 'sfx', value: number): void {
    const v = Math.max(0, Math.min(10, Math.round(value)));
    if (kind === 'master') {
      this.settings.volMaster = v;
      // 마스터를 직접 만지면 음소거는 해제된 것으로 본다 (0 = 사실상 음소거)
      if (v > 0) this.settings.mute = false;
    } else if (kind === 'bgm') this.settings.volBgm = v;
    else this.settings.volSfx = v;
    this.save();
  }
}

export const gameState = new GameStateImpl();
gameState.load();
