import type { KakaoPrompt, MainQuestId, VoteQuestion } from './types';

// ─────────────────────────────────────────────
// 화면 / 공통
// ─────────────────────────────────────────────
export const GAME_WIDTH = 720;

/**
 * 게임 높이 — 기기 화면 비율에 맞춰 부팅 시 1회 계산 (기준 1280 = 9:16).
 * 요즘 폰(9:19.5 등)은 세로가 더 길어 고정 1280이면 위아래가 비는데,
 * 높이를 비율대로 늘려 그리면 레터박스 없이 화면을 꽉 채운다.
 * 씬들은 배경을 GAME_HEIGHT까지 칠하고 하단 UI를 GAME_HEIGHT 기준으로
 * 앵커하므로 자동으로 대응된다.
 */
function computeGameHeight(): number {
  if (typeof window === 'undefined') return 1280;
  // 세이프에어리어가 반영된 #app의 실제 크기가 유일한 진실 — 여기 비율과 게임 비율이
  // 어긋나면 FIT가 레터박스를 만든다 ("화면이 작아 보이는" 문제의 정체).
  // 클램프를 [1200,2000]으로 넓혀 요즘 세로 긴 폰(비율 2.1~2.3)도 클램프에 안 걸리고
  // #app 비율과 정확히 일치 → FIT 레터박스 없이 꽉 찬다. (씬은 GAME_HEIGHT에 맞춰 앵커)
  const app = document.getElementById('app');
  const vv = window.visualViewport;
  const w = app?.clientWidth || vv?.width || window.innerWidth || GAME_WIDTH;
  const h = app?.clientHeight || vv?.height || window.innerHeight || 1280;
  const byAspect = Math.round((GAME_WIDTH * h) / Math.max(1, w));
  return Math.max(1200, Math.min(2000, byAspect));
}

/**
 * iOS PWA는 부팅 직후 뷰포트 값이 설익어(세이프에어리어 미적용 등) 실제보다 크게
 * 재기도 한다 — 그 값으로 게임 높이를 굳히면 판 전체가 레터박스에 갇힌다.
 * 그래서 main.ts가 **뷰포트가 안정된 뒤 게임 생성 직전에** 이 함수로 확정한다.
 * (ESM live binding이라 씬들은 갱신된 값을 본다)
 */
export let GAME_HEIGHT = computeGameHeight();
export function finalizeViewport(): void {
  GAME_HEIGHT = computeGameHeight();
}

export const HP_MAX = 100;
/** 목숨 최대 칸 수 — 새 판은 1칸으로 시작, 벽치기 노미스 클리어로 채운다 */
export const LIVES_MAX = 3;
/** 하트 1칸의 내부 단위 수 (⅓ 단위 — 미니 퀘스트 성공 보상이 1단위 = ⅓칸) */
export const LIFE_UNITS = 3;
/** 주간 보너스 주기 — 이 일수를 클리어할 때마다(7·14·21…일차) 하트 1칸을 덤으로 준다 */
export const WEEKLY_BONUS_DAYS = 7;

/** 제목·버튼·강조 — 굵고 둥근 만화체 */
export const FONT = "'Jua', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
/** 본문·대사 — 꾹꾹 눌러쓴 펜글씨체 */
export const FONT_BODY = "'Poor Story', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

/**
 * 플랫 카툰 팔레트 — 반투명·그라데이션을 쓰지 않고 '단색 + 굵은 검정 외곽선'으로만 쌓는다.
 * (기존 어두운 남색 UI가 밝은 손그림 화면과 따로 놀아 전면 교체)
 */
export const COLORS = {
  bg: 0x1a1a2e,
  /** 패널·말풍선 바탕 (게임 화면 위 HUD 칩) */
  panel: 0xffffff,
  /**
   * 전체를 덮는 오버레이 판(도움말·리더보드·소리설정·일시정지)의 바탕.
   * 이쪽은 글자가 많아 흰 바탕이면 흰 글씨가 통째로 사라진다 — 짙은 남색 판에
   * 굵은 검정 외곽선을 둘러 '칠판' 느낌으로 간다.
   */
  panelDark: 0x1b2540,
  /** 메인 테마색 (타이틀 바·포인트 패널) */
  panelLight: 0x5ca0f2,
  accent: 0xef476f,
  safe: 0x06d6a0,
  warn: 0xffd166,
  white: 0xffffff,
  /** 모든 외곽선·기본 글자 */
  ink: 0x000000,
  inkCss: '#000000',
  /** 비활성 */
  muted: 0xe0e0e0,
  textCss: '#ffffff',
  subCss: '#e8eef7',
  accentCss: '#ef476f',
  safeCss: '#06d6a0',
  warnCss: '#ffd166',
} as const;

/** UI 공통 치수 — 굵은 외곽선과 블러 없는 하드 섀도가 이 화풍의 뼈대다 */
export const UI = {
  /** 외곽선 두께 */
  stroke: 4,
  /** 패널 모서리 */
  radius: 12,
  /** 버튼 모서리 */
  btnRadius: 16,
  /** 하드 섀도 오프셋 (패널) */
  shadow: 6,
  /** 버튼이 눌리며 내려앉는 양 = 아래 그림자 두께 */
  btnLift: 8,
} as const;

export function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/** 일차별 난이도 계수 0~1 — 출현 비율·거리처럼 '얼마나'에 해당하는 값에 쓴다 */
export function difficulty(day: number): number {
  return Math.min(1, 0.3 + day * 0.07);
}

// ─────────────────────────────────────────────
// 템포 — 일차가 오를수록 판이 지수적으로 빨라진다
// ─────────────────────────────────────────────
/** 하루당 속도 증가율 (복리) */
const PACE_BASE = 1.09;
/** 속도 상한 — 이 위로는 사람 손이 아니라 운이 판을 결정한다 */
const PACE_CAP = 2.4;

/**
 * 일차별 속도 배율 (1일차 = 1.0, 복리로 증가).
 * 1→1.00, 5→1.41, 8→1.83, 10→2.17, 11→2.37, 12일차 이후 2.4에서 포화.
 * 간격·제한시간을 이 값으로 **나눠서** 쓴다.
 */
export function pace(day: number): number {
  return Math.min(PACE_CAP, Math.pow(PACE_BASE, Math.max(0, day - 1)));
}

/**
 * 반응 유예의 절대 하한 (ms).
 * 모바일 터치는 '보고 → 판단 → 손가락 접촉'에 최소 이만큼이 걸린다.
 * 속도가 아무리 올라가도 이 아래로는 내리지 않는다 — 판이 빨라지는 것과
 * 물리적으로 불가능해지는 것은 다르다.
 */
export const REACT_FLOOR_MS = 400;
/** 리듬 판정창 전체 폭(±반경×2)의 절대 하한 (ms) — 모바일 터치 지연 감안 */
export const HIT_FLOOR_MS = 320;

/** 선배 등장 리듬 설계값 (BaseMainScene의 SeniorTempo와 동일한 모양) */
export interface SeniorTempoSpec {
  baseGapMs: number;
  baseStayMs: number;
  minRecoveryMs: number;
  maxPresenceRatio: number;
}

/** 속도 배율을 적용해 짧아지되, 하한 밑으로는 내려가지 않는 시간 */
export function paced(baseMs: number, day: number, floorMs = 0): number {
  return Math.max(floorMs, Math.round(baseMs / (pace(day) * DIFF_SCALE)));
}

/**
 * 전체 난이도 배율 — 판 전체를 한 번에 조이는 손잡이.
 * 일차별 지수 가속(pace)이 램프를 담당하므로 여기서 추가로 조이지 않는다.
 * 판이 전반적으로 버겁다/헐겁다는 피드백은 이 값 하나로 대응한다.
 */
export const DIFF_SCALE = 1.0;
/** 반응 유예·제한시간처럼 **짧아질수록 어려워지는** 값 */
export function tight(ms: number): number {
  return Math.round(ms / DIFF_SCALE);
}
/** 요구량·빈도·속도처럼 **커질수록 어려워지는** 값 */
export function harder(v: number): number {
  return v * DIFF_SCALE;
}
/** 일차별 BGM 템포 배율 — 갈수록 빨라진다 (게임오버 후 새 판은 다시 1.0부터) */
export function bgmTempo(day: number): number {
  return Math.min(1.45, 1 + (day - 1) * 0.035);
}

// ─────────────────────────────────────────────
// 메인 퀘스트 배정
// ─────────────────────────────────────────────
/** 벽치기(Q5) 편입 일차 — 첫판부터 다른 메인 퀘스트와 동일 확률로 나온다 */
export const WALLPUNCH_UNLOCK_DAY = 1;

// ─────────────────────────────────────────────
// 미니 퀘스트 발생 규칙
// ─────────────────────────────────────────────
export const MINI = {
  /**
   * 하루(메인 퀘스트 1회) 안에서 미니 퀘스트 발생 확률.
   * 유저 지시: **1일차 0%에서 시작해 지수적으로 올라 10일차 ≈50%, 이후로도 80%까지 지속 증가.**
   * p(day) = 0.8·(1 − e^(−0.109·(day−1)))  → day1=0, day5≈28%, day10≈50%, day20≈70%, →80% 포화.
   */
  chance: (day: number): number => Math.min(0.8, 0.8 * (1 - Math.exp(-0.109 * (day - 1)))),
  /** 하루(메인 퀘스트 1회) 최대 미니 퀘스트 발생 횟수 — 유저 지시: 최대 1회(안 나오거나 1번) */
  maxPerDay: 1,
  /** 실패 시 목숨 차감 (내부 단위 — LIFE_UNITS(3) = 1칸). 하루는 이어서 진행, 0이면 게임 오버 */
  failLifeUnits: 3,
  /** 첫 번째 인터럽트 지연 (ms 범위) — 메인 퀘스트가 짧아진 만큼 인터럽트도 앞당김 */
  firstDelayMs: [1200, 2500] as const,
  /** 두 번째 인터럽트 추가 지연 (ms 범위) */
  secondDelayMs: [2000, 3500] as const,
} as const;

// ─────────────────────────────────────────────
// Q1. 샤워장에서 몰래 노래 틀기
// ─────────────────────────────────────────────
export const Q1_SHOWER = {
  /** 노래 총 재생 시간 (재생 중일 때만 진행됨) — 판당 10~12초, 선배 조우 3~4회 */
  songMs: 7000,
  /** 샤워 제한 시간 — 점유율 상한(0.45) 기준 필요시간 12.7초 + 여유 (운빨 사망 방지) */
  showerTimeMs: (day: number): number => Math.round(lerp(13000, 15000, difficulty(day))),
  /** 선배는 예고 없이 등장한다. 등장 순간부터 버튼을 누를 수 있는 반응 유예 시간
   *  (모바일 터치 반응 한계 고려 — 커튼 등장 보정 후에도 360ms 밑으로 내려가지 않게) */
  reactMs: (day: number): number => paced(760, day, REACT_FLOOR_MS),
  /** 등장 리듬 — 실제 간격은 패턴(연타/페인트/뜸들이기)으로 흩어진다 */
  tempo: (day: number): SeniorTempoSpec => ({
    baseGapMs: paced(1700, day, 800),
    baseStayMs: Math.round(900 * Math.min(1.5, Math.pow(pace(day), 0.35))),
    // 반응 유예만큼은 반드시 노래를 들을 틈이 있어야 한다
    minRecoveryMs: Math.max(650, paced(1000, day, 650)),
    // 선배가 화면을 절반 넘게 차지하면 노래를 끝낼 수 없다 — 45%로 묶는다
    maxPresenceRatio: 0.45,
  }),
} as const;

// ─────────────────────────────────────────────
// Q2. 복도 인사/경례 판별 — 견장 줄 수(1=후배, 2=동기, 3=선배)를 보고
// 제한시간 안에 올바른 응대를 골라야 한다. 후배 인사만 카운트.
// ─────────────────────────────────────────────
export const Q2_HALLWAY = {
  /** 제대로 응대해야 하는 인원 수 — 한 판을 짧게, 대신 템포로 조인다 */
  targetCount: (day: number): number => Math.min(9, 4 + Math.floor((day - 1) / 3)),
  /**
   * 한 사람이 복도 저 끝에서 내 앞까지 걸어오는 시간.
   * 이 시간이 곧 견장을 읽고 판단할 시간이라 일차가 오를수록 짧아진다(지수 가속).
   */
  // 하한 1100은 여정시간 ±15% 흔들림까지 감안한 후반 선배 데드라인 반응 예산의 마지노선
  // 유저 지시: 상대가 걸어오는 속도 10% 하향 = 접근 시간 ≈11% 증가(더 여유롭게 판독).
  approachMs: (day: number): number => Math.round(paced(1600, day, 1100) * 1.11),
  /** 문이 열리고 복도로 나와 몸을 돌리기까지 (이 동안은 아직 다가오지 않는다) */
  stepOutMs: 300,
  /** 앞사람을 처리하고 다음 사람 문이 열리기까지의 텀 — 한 명씩 컨베이어처럼 */
  gapMs: (day: number): number => paced(300, day, 130),
  /**
   * **선배 경례 데드라인** — 걸어오는 여정의 이 비율을 넘기기 전에 내가 먼저
   * 경례해야 한다(0=문 앞, 1=내 앞 도착). 늦으면 그 자리에서 잡힌다.
   * 선은 멀찍이(복도 안쪽) 긋고 대신 접근을 빠르게 — 보자마자 판독하는 게임.
   * 후반 하한 0.42는 접근 하한 1100ms·여정 -15% 흔들림 최악에도 예산 ~390ms를 지키는 선.
   * 유저 지시: 먼저 경례하기가 빡세서 선을 7% 널널하게(×1.07 — 마감 비율을 더 뒤로).
   */
  saluteDeadline: (day: number): number =>
    Math.min(0.9, lerp(0.64, 0.42, difficulty(day)) * 1.07),
  /** 선배(3줄) 출현 비율 — 일차가 오를수록 증가 */
  seniorShare: (day: number): number => Math.min(0.42, 0.18 + day * 0.014),
  /** 동기(2줄) 출현 비율 */
  peerShare: 0.26,
  /**
   * 응대를 그르치거나 놓쳤을 때의 대가 — HP가 아니라 **하트**를 깎는다.
   * 하트 한 칸 = LIFE_UNITS(3)단위이므로 1단위 = ⅓칸.
   */
  missLifeUnits: 1,
} as const;

// ─────────────────────────────────────────────
// Q3. 몰래 결식하고 전자레인지 돌리기
// ─────────────────────────────────────────────
export const Q3_MICROWAVE = {
  /** 조리 완료까지 전자레인지 앞 체류 필요 시간 — 판당 9~13초, 선배 조우 3~4회 */
  cookMs: (day: number): number => Math.round(lerp(4600, 6200, difficulty(day))),
  /** 선배는 예고 없이 등장한다. 등장 순간부터 세탁실로 피할 수 있는 반응 유예 시간 */
  reactMs: (day: number): number => paced(820, day, REACT_FLOOR_MS),
  /** 등장 리듬 — 패턴으로 흩어지되 조리할 틈은 반드시 남는다 */
  tempo: (day: number): SeniorTempoSpec => ({
    // 유저 지시: 더 자주 온다(오다 마는 페인트 포함) — 간격 추가 단축.
    // 단, 점유율 상한(maxPresenceRatio)이 조우 사이 회복 틈을 보장해 완전 불가 판을 막는다.
    baseGapMs: paced(1300, day, 630),
    // 접근 + '잠깐 기다림' + 물러남을 담도록 체류를 조금 늘렸다(도착 후 바로 안 가고 머문다).
    baseStayMs: Math.round(1620 * Math.min(1.35, Math.pow(pace(day), 0.3))),
    minRecoveryMs: Math.max(600, paced(950, day, 600)),
    // 조리는 전자레인지 앞에 있어야만 진행된다 — 점유율 상한이 곧 클리어 보장선
    maxPresenceRatio: 0.46,
  }),
  /** 완전소등까지 제한시간 — 소등 전에 "삐-"까지 끝내야 한다.
   *  숨는 시간(선배 조우 기대값)을 감안해 조리 시간 대비 넉넉하되,
   *  세탁실 캠핑은 반드시 실패하는 수준으로 설정 */
  lightsOutMs: (day: number): number => tight(lerp(11500, 16500, difficulty(day))),
} as const;

// ─────────────────────────────────────────────
// Q4. 태권도장까지 가기 (탑다운 잠입 — 선배 시선은 CCTV처럼 회전한다)
// ─────────────────────────────────────────────
export const Q4_WALK = {
  /** 도착까지 총 거리 (월드 px) — 판당 9~13초, 짧고 굵게 */
  distancePx: (day: number): number => Math.round(lerp(2900, 4200, difficulty(day))),
  /**
   * 이동 속도 (px/s). 전체적으로 느릿하다는 피드백에 맞춰 올렸다.
   * 일차가 오를수록 판이 빨라지지만, 속도가 오르면 같은 거리를 더 짧게 노출되므로
   * 아래 시야 회전 속도와 함께 올려야 실제로 어려워진다.
   */
  walkSpeed: (day: number): number => 300 * Math.min(1.35, Math.pow(pace(day), 0.3)),
  runSpeed: (day: number): number => 660 * Math.min(1.35, Math.pow(pace(day), 0.3)),
  /**
   * 구보 HP 소모 (초당) — **거리·시야를 고려한 설계값**. 전 구간을 내리 뛰면 총
   * HP의 150%를 태우므로 **약 67% 지점에서 탈진** → "전 구간 구보"는 불가능(유저 지시).
   * 하지만 시야(구보 강제 구간)만 골라 뛰고 사각지대에서 걸어 회복하면 완주 가능(불가능 아님).
   *   runHp = 1.5 × HP_MAX × 구보속도 ÷ 총거리  (거리·속도가 일차마다 달라도 자동 보정)
   * 소비 HP는 구보 거리에 선형 비례 → 필요한 만큼만 뛰고 아껴야 한다(너무 쉽지 않게).
   */
  runHpPerSec: (day: number): number =>
    (1.5 * HP_MAX * Q4_WALK.runSpeed(day)) / Q4_WALK.distancePx(day),
  /**
   * 걷는 동안 HP 회복 (초당).
   * 지속 가능한 구보 비율 = regen / (run + regen) = 5/19 ≈ 26%.
   * 시야가 도로를 덮는 비율이 이보다 낮게 유지되어야 '끝까지 갈 수 있는' 판이 된다 —
   * 그래서 선배 간격(seniorSpacingPx)에 하한을 두어 밀도가 폭주하지 않게 막는다.
   */
  walkRegenPerSec: 5,
  /** 길가 선배가 제자리를 지키지 않고 순찰하는 폭(px)과 속도(px/s) */
  patrolRangePx: (day: number): number => Math.round(lerp(60, 150, difficulty(day))),
  patrolSpeed: (day: number): number => 45 * Math.min(1.6, pace(day)),
  /** 시야에 걸린 채 걷기가 허용되는 유예 (ms) — 이 안에 구보로 전환해야 한다.
   *  유저 지시: 기본 200→350ms로 상향(너무 빡빡해서 조금 완화). 반응 하한 150.
   *  단, 이 유예는 **선배별**로 쌓이는 의심(susp)의 한계일 뿐 — 뛰다 걷다 깜빡여도
   *  리셋되지 않으므로 사실상 재사용 불가(같은 시야에서 재차 걸으면 곧바로 발각). */
  graceMs: (day: number): number => paced(350, day, 150),
  /** 시야를 벗어났을 때 의심(susp)이 식는 속도 배율(<1 = 쌓이는 것보다 천천히 잊는다).
   *  0.5 = 시야 밖 400ms를 '연속으로' 있어야 200ms치 의심이 풀린다 → 짧은 깜빡임으론 리셋 불가.
   *  진짜 사각지대에서 한동안 걸으면 풀려 HP 회복이 가능(정상 플레이는 그대로). */
  suspDecay: 0.5,
  /**
   * 도로변 선배 배치 간격 (월드 px). 일차가 오를수록 촘촘해지되 하한을 둔다.
   * 유저 지시: 선배 수 약간 ↑(간격 축소). 대신 시야 빔을 좁혀 지속가능선은 지킨다.
   */
  seniorSpacingPx: (day: number): number => Math.max(540, paced(1080, day)),
  /** 같은 지점에 맞은편 선배가 하나 더 서는(시야 교차 구간) 확률 — 유저 지시로 소폭 ↑ */
  pairChance: 0.28,
  /** CCTV 시야 설정 — 시선은 변칙적으로 움직인다 (목표각을 수시로 갈아치움).
   *  선배가 길가에서 멀리 떨어져 있어(측면 ~300px) 시야 끝자락만 도로 중앙에 닿는다 */
  vision: {
    rangePx: 470,
    // 유저 지시: 빔 폭을 좁힌다(26→22°). 대신 선배 수를 늘려 전체 난이도는 ↑.
    halfAngleDeg: 22,
    /** 정면 기준 좌우 회전 폭 (도) */
    ampDeg: 80,
    /** 시선 회전 속도 (도/초) — 일차가 오를수록 빨라진다 */
    turnDegPerSec: (day: number): number => 95 * Math.min(2.6, pace(day)),
    /** 방향 전환(새 목표각 선택) 간격 (ms) — 일차가 오를수록 잦아진다 */
    thinkMsRange: (day: number): [number, number] => [
      paced(1000, day, 300),
      paced(1900, day, 620),
    ],
    /** 홱 돌아보기(3배속 스냅 회전) 확률 */
    snapChance: (day: number): number => lerp(0.15, 0.55, difficulty(day)),
  },
} as const;

// ─────────────────────────────────────────────
// Q5. 옆방 벽 치기 — 샤워장 노래에 맞춘 리듬게임 (자동 시작).
// 👊 노트가 벽의 판정 링(위/중간/아래)에 닿는 순간 그 높이를 탭.
// 박자가 어긋난 쿵 소리(미스)가 쌓이면 소음이 복도까지 울려 발각된다.
// ─────────────────────────────────────────────
export const Q5_WALLPUNCH = {
  /**
   * 노래 배속 — 첫판부터 살짝 빠르게, 일차가 오를수록 더 빨라진다 (게임 전반의
   * "갈수록 빨라진다" 원칙). 칩튠 스텝과 판정 격자가 같은 배율을 쓰므로 싱크가 유지된다.
   */
  // 유저 지시: 속도 7% 추가 하향(누적 ×0.865) — 배속을 더 낮춰 노트/판정이 느긋해진다.
  songRate: (day: number): number => Math.min(1.39, (1.12 + (day - 1) * 0.045) * 0.865),
  /** 박자 간격 (ms) — 노래 원속 기준 2스텝(380ms)을 배속으로 나눈 값 */
  beatMs: (day: number): number => Math.round(380 / Q5_WALLPUNCH.songRate(day)),
  /** 곡의 첫 박 오프셋 (ms) — 칩튠 스케줄러가 재생 시작 +100ms에 첫 스텝을 놓는다 */
  songLeadMs: 100,
  /** 노트 수 — 같은 시간에 더 많이 두드리게, 일차가 오를수록 더 (판당 4~7초) */
  noteCount: (day: number): number => Math.min(22, 12 + (day - 1) * 2),
  /** PERFECT 판정 반경 (±ms) */
  perfectMs: 90,
  /** GOOD 판정 반경 (±ms) — 이 밖은 미스. 판정창 전체 폭 = HIT_FLOOR_MS */
  goodMs: HIT_FLOOR_MS / 2,
  /** 미스(놓침·헛타·자리 틀림) 허용 — 이 횟수를 채우는 순간 발각 */
  maxMiss: 3,
  /** 반박(엇박) 노트가 따라붙을 확률 — 후반의 리듬 난이도 */
  offbeatChance: (day: number): number => Math.min(0.55, 0.15 + (day - 1) * 0.05),
  /** 쉼표(비트 건너뛰기) 확률 — 단조로운 메트로놈이 되지 않게 리듬을 만든다 */
  restChance: 0.18,
  /** 노트가 화면 오른쪽에서 판정 링까지 흘러오는 시간 (ms) — 고정이라 읽기 쉽다 */
  approachMs: 1150,
  /** 노미스(풀콤보) 보상 — 목숨 내부 단위 (5 = 1칸) */
  fullComboLifeUnits: 3,
  /** 벽 타격 지점(레인) 수 — 1~2일차 2개, 3일차부터 3개 (위/중간/아래) */
  laneCount: (day: number): number => (day >= 3 ? 3 : 2),
} as const;

// ─────────────────────────────────────────────
// M1. 카톡 답장하기 (타자)
// ─────────────────────────────────────────────
export const M1_KAKAO = {
  /** 제한 시간 (고정 13.5초 — 타자 난이도 추가 7% 하향, 시간이 이 게임의 전부) */
  timeMs: tight(13535),
  /** 붉은 펄스 시작 임계 (남은 ms) */
  panicMs: 4000,
  /** 일차별 문장 티어 — 일차가 오를수록 더 긴 답장을 요구한다 (3일마다 한 단계) */
  tier: (day: number): number => Math.min(3, Math.floor((day - 1) / 3)),
  // 생도 답장의 기본 — "예!"로 받고 문장마다 느낌표 (누락 = 오타 취급)
  prompts: [
    // tier 0 — 짧음
    { msg: '야 지금 어디냐', reply: '생활관입니다!', tier: 0 },
    { msg: '내일 아침 점호 몇 시지', reply: '6시입니다!', tier: 0 },
    { msg: '답장 왜 이렇게 늦냐', reply: '죄송합니다!', tier: 0 },
    { msg: '오늘 훈련 어땠냐', reply: '힘들었습니다!', tier: 0 },
    { msg: '지금 뭐 하냐', reply: '공부 중입니다!', tier: 0 },
    // tier 1 — 중간
    { msg: '10분 뒤에 생활관 앞으로 와라', reply: '예! 알겠습니다!', tier: 1 },
    { msg: '아까 복도에서 왜 인사 안 했냐', reply: '죄송합니다! 못 봤습니다!', tier: 1 },
    { msg: '이따 수업 끝나고 내 방으로 와라', reply: '예! 알겠습니다!', tier: 0 },
    { msg: '너 아까 벌점입력 지시한 거 넣었냐', reply: '예! 입력했습니다!', tier: 0 },
    { msg: '너네 방에서 테니스채 좀 빌려가도 되냐?', reply: '예! 쓰셔도 됩니다!', tier: 1 },
    { msg: '지금 바로 내려올 수 있냐', reply: '예! 지금 바로 가겠습니다!', tier: 1 },
    { msg: '어제 소등 후에 뭐 했냐', reply: '바로 취침했습니다!', tier: 1 },
    // tier 2 — 김
    { msg: '단체 채팅방에 올라온 공지 확인했냐', reply: '죄송합니다! 지금 확인했습니다!', tier: 2 },
    {
      msg: '너 뭔데 단재관에서 손 풀고 털레털레 걸어다니냐',
      reply: '죄송합니다! 바로 고치겠습니다!',
      tier: 2,
    },
    { msg: '후배들 군기가 빠진 것 같지 않냐', reply: '제가 잘 챙기도록 하겠습니다!', tier: 2 },
    { msg: '샤워장에서 노랫소리 들렸다는데 아는 거 있냐', reply: '아닙니다! 저는 모르는 일입니다!', tier: 2 },
    { msg: '내일 태권도 시합 준비는 잘 되고 있냐', reply: '예! 열심히 준비하고 있습니다!', tier: 2 },
    // tier 3 — 아주 김 (후반부)
    {
      msg: '내일 검열이다. 호실 정리랑 복장 상태 다 확인했냐',
      reply: '예! 호실 정리 마쳤고 복장도 확인했습니다!',
      tier: 3,
    },
    {
      msg: '이번 주 당직 근무표 바뀐 거 인원들한테 다 전파했냐',
      reply: '예! 전 인원에게 전파 완료했습니다!',
      tier: 3,
    },
    {
      msg: '체력검정 준비 어떻게 하고 있냐, 종목별로 말해봐라',
      reply: '예! 오래달리기와 팔굽혀펴기 위주로 준비하고 있습니다!',
      tier: 3,
    },
    {
      msg: '아까 회의 내용 정리해서 오늘 안에 보내라',
      reply: '예! 정리해서 오늘 안에 보내드리겠습니다!',
      tier: 3,
    },
  ] as KakaoPrompt[],
} as const;

// ─────────────────────────────────────────────
// M2. 투표하기 (함정 선지 독해)
// ─────────────────────────────────────────────
export const M2_VOTE = {
  timeMs: (day: number): number => tight(Math.max(7000, 11500 - day * 150)),
  level: (day: number): number => Math.min(3, 1 + Math.floor(day / 5)),
  /** 선지 수 — 레벨 1은 2지선다, 이후 3지선다 */
  optionCount: (level: number): number => (level === 1 ? 2 : 3),
  // 매판 corrects에서 1개 + wrongs에서 (선지 수-1)개를 뽑아 순서를 섞는다 — 답 암기 불가
  questions: [
    // ── 레벨 1 ──
    {
      level: 1,
      msg: '안중근홀 특강에서 졸고 있던 인원 수합해와',
      q: '당신은 졸지 않았다.\n올바른 답변을 골라라',
      corrects: [
        '졸지 않았다고 하기는 어렵지 않습니다',
        '졸았다고는 할 수 없습니다',
        '조는 모습을 보였다는 것은 사실이 아닙니다',
      ],
      wrongs: [
        '졸지 않았다고 하기는 어렵습니다',
        '졸지 않은 것은 아닙니다',
        '저는 안 졸았다고 생각했지만 선배님께서 졸았다고 보셨다면 그게 맞습니다',
      ],
    },
    {
      level: 1,
      msg: '아침점호 때 푸쉬업 개수 다 안 채운 인원 수합해라',
      q: '당신은 개수를 다 채웠다.\n올바른 답변을 골라라',
      corrects: [
        '다 못 채웠다고 하기는 어렵습니다',
        '개수를 채우지 않은 것이 아닙니다',
        '덜 했다는 것은 사실이 아닙니다',
      ],
      wrongs: [
        '다 채웠다고 하기는 어렵습니다',
        '다 채웠다고 할 수는 없습니다',
        '채우지 않았다는 것을 부정하기 어렵습니다',
      ],
    },
    {
      level: 1,
      msg: '오늘 결식한 인원 자수해라',
      q: '당신은 결식하지 않았다.\n올바른 답변을 골라라',
      corrects: [
        '결식했다고 하기는 어렵습니다',
        '결식한 적이 없다는 것은 사실입니다',
        '식사를 거른 것이 아닙니다',
      ],
      wrongs: [
        '결식하지 않았다고 하기는 어렵습니다',
        '안 결식했다고 할 수는 없습니다',
        '결식하지 않은 것이 아닙니다',
      ],
    },

    // ── 레벨 2 ──
    {
      level: 2,
      msg: '생활관 정리 안 하고 나온 인원 조사 중이다',
      q: '당신은 정리를 하고 나왔다.\n올바른 답변을 골라라',
      corrects: [
        '정리를 안 했다는 것은 사실이 아닙니다',
        '정리하지 않은 것이 아닙니다',
        '안 하고 나왔다고 말할 수 없습니다',
      ],
      wrongs: [
        '정리했다고 말할 수는 없습니다',
        '정리를 안 했다는 것을 부정하기 어렵습니다',
        '정리한 것이 아닙니다',
      ],
    },
    {
      level: 2,
      msg: '오늘 체육 수업 갈 때 걸어간 인원 있다던데?',
      q: '당신은 끝까지 뛰어갔다.\n올바른 답변을 골라라',
      corrects: [
        '걸어갔다고 보기는 어렵습니다',
        '걸어간 적이 없다는 것은 사실입니다',
        '뛰지 않은 구간은 없습니다',
      ],
      wrongs: [
        '걸어가지 않았다고 보기는 어렵습니다',
        '안 걸어갔다고 할 수는 없습니다',
        '걸어가지 않은 것이 아닙니다',
      ],
    },
    {
      level: 2,
      msg: '필수소지품 안 들고 나온 인원 지금 확인한다',
      q: '당신은 필수소지품을 다 챙겼다.\n올바른 답변을 골라라',
      corrects: [
        '빠뜨렸다고 하기는 어렵습니다',
        '안 챙겼다는 것은 사실이 아닙니다',
        '챙기지 않은 것이 아닙니다',
      ],
      wrongs: [
        '챙겼다고 하기는 어렵습니다',
        '챙겼다고 할 수는 없습니다',
        '빠뜨리지 않은 것이 아닙니다',
      ],
    },

    // ── 레벨 3 ──
    {
      level: 3,
      msg: '소등 후에 소란행위한 인원 자수해라',
      q: '당신은 소란을 피우지 않았다.\n올바른 답변을 골라라',
      corrects: [
        '소란을 피웠다는 주장이 사실이라고 할 수 없습니다',
        '떠들지 않았다는 것을 부정할 수 없습니다',
        '소란행위를 했다는 것이 사실이 아니지 않다고 할 수 없습니다',
      ],
      wrongs: [
        '소란을 피우지 않았다고 하면 거짓이 아닌 것이 아닙니다',
        '떠들었다는 것을 부정하기는 어렵습니다',
        '소란을 피우지 않은 것이 아님을 인정합니다',
      ],
    },
    {
      level: 3,
      msg: '오늘 조발 상태 불량인 인원 전부 적어서 올려라',
      q: '당신은 조발을 규정대로 했다.\n올바른 답변을 골라라',
      corrects: [
        '조발을 하지 않았다는 것이 사실이라고 할 수 없습니다',
        '규정대로 하지 않았음을 인정할 수 없습니다',
        '조발 상태가 불량하다는 것은 사실이 아닌 것이 아닙니다',
      ],
      wrongs: [
        '규정대로 하지 않은 적이 없지는 않습니다',
        '조발을 했다고 하면 거짓입니다',
        '불량하다는 것을 부정할 수 없지 않은 것은 아닙니다',
      ],
    },
    {
      level: 3,
      msg: '동아리 무단 불참 인원 조사 중이다',
      q: '당신은 빠진 적이 있다. (양심상 인정해야 한다)\n올바른 답변을 골라라',
      corrects: [
        '빠진 적이 없지 않습니다',
        '빠졌다는 것은 사실이 아니지 않습니다',
        '빠진 적이 없다고 하면 거짓입니다',
      ],
      wrongs: [
        '빠진 적이 없다고 하면 거짓이 아닙니다',
        '빠졌다는 것을 부정할 수 없는 것은 아닙니다',
        '빠졌다고 볼 수는 없습니다',
      ],
    },
  ] as VoteQuestion[],
} as const;

// ─────────────────────────────────────────────
// M3. 단체 채팅방 사진 고르기
// ─────────────────────────────────────────────
export const M3_PHOTO = {
  roomTitle: '너네 장난하냐?',
  seniorMsg: '내가 이렇게 방 정리하라고 시켰냐?',
  chooseInstruction: '제대로 정리된 옷장을 고르세요',
  spotInstruction: '잘못된 부분을 터치하세요',
  /** 고르기 모드 제한 시간 */
  chooseTimeMs: tight(4500),
  /** 틀린그림찾기 모드 제한 시간 */
  spotTimeMs: tight(7000),
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
    title: '복도에서 어깨힘주고 인사받기',
    emoji: '🫡',
    tip: '복도로 걸어오는 상대의 견장을 읽어라 — 1줄 후배·2줄 동기 → 🙇 인사, 3줄 선배 → 🫡 경례. 제한시간 안에!',
  },
  microwave: {
    title: '몰래 결식하고 전자레인지 돌리기',
    emoji: '🍜',
    tip: '선배가 나타나면 🫣 버튼 꾹! 나갈 때까지 유지 — 소등 전에 조리 100%를 채워라',
  },
  walk: {
    title: '태권도장까지 걸어가기',
    emoji: '🥋',
    tip: '선배 시야(부채꼴)에 걸린 채 걸으면 발각! 꾹 눌러 구보로 돌파 (HP 소모), 사각지대에선 걸어서 회복',
  },
  wallpunch: {
    title: '옆방(1학년 방) 벽 치기',
    emoji: '💥',
    tip: '노래 박자에 맞춰 👊가 링에 닿는 순간, 그 높이를 탭! 미스 3번=발각 · 노미스=❤️+1',
  },
};

/** 미니 퀘스트 씬 키 목록 */
export const MINI_QUEST_KEYS = ['kakao', 'vote', 'photo'] as const;
