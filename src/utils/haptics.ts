/**
 * 짧은 햅틱 진동 — 지원 기기(안드로이드 크롬 등)에서만 동작.
 * iOS 사파리는 웹 진동 API를 지원하지 않아 조용히 무시된다.
 */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 미지원 환경 무시
  }
}

/** 자주 쓰는 패턴 모음 */
export const HAPTIC = {
  /** 퀘스트 성공 — 짧고 경쾌하게 */
  success: 45,
  /** 발각/사망 — 묵직한 더블 */
  fail: [90, 60, 120] as number[],
  /** 미니 퀘스트 성공 */
  miniSuccess: 30,
  /** 목숨 획득 */
  lifeGain: [30, 40, 60] as number[],
  /** 부활 */
  revive: [40, 50, 40] as number[],
  /** 경고성 피해 */
  damage: 25,
} as const;
