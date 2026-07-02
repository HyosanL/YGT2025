import type { LeaderboardEntry } from '../types';

const QUEUE_KEY = 'ygt2025_lb_queue_v1';
const API_URL = '/api/leaderboard';
const FETCH_TIMEOUT_MS = 6000;

export interface SubmitResult {
  ok: boolean;
  rank?: number;
  /** 네트워크 실패로 로컬 큐에 저장됨 (다음 접속 시 재시도) */
  queued?: boolean;
  error?: string;
}

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function readQueue(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as LeaderboardEntry[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: LeaderboardEntry[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // 저장 불가 환경은 무시
  }
}

/** 상위 50개 조회. 실패 시 null (호출측에서 로컬 최고기록만 표시) */
export async function fetchTop(): Promise<LeaderboardEntry[] | null> {
  try {
    const res = await fetchWithTimeout(API_URL);
    if (!res.ok) return null;
    const data = (await res.json()) as { ok: boolean; entries?: LeaderboardEntry[] };
    return data.ok && Array.isArray(data.entries) ? data.entries : null;
  } catch {
    return null;
  }
}

/** 기록 등록. 네트워크 실패 시 localStorage 큐잉 후 다음 접속 시 재시도 */
export async function submitScore(entry: LeaderboardEntry): Promise<SubmitResult> {
  try {
    const res = await fetchWithTimeout(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    const data = (await res.json()) as { ok: boolean; rank?: number; error?: string };
    if (!res.ok || !data.ok) {
      // 서버가 명시적으로 거절한 것 — 큐잉해도 소용없음
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, rank: data.rank };
  } catch {
    const queue = readQueue();
    queue.push(entry);
    writeQueue(queue);
    return { ok: false, queued: true };
  }
}

/** 부팅 시 호출: 큐에 쌓인 기록 재전송 시도 */
export async function flushQueue(): Promise<void> {
  const queue = readQueue();
  if (queue.length === 0) return;
  const remaining: LeaderboardEntry[] = [];
  for (const entry of queue) {
    try {
      const res = await fetchWithTimeout(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        // 서버 검증 거절(4xx)은 폐기, 서버 장애(5xx)는 다음에 재시도
        if (res.status >= 500) remaining.push(entry);
        void data;
      }
    } catch {
      remaining.push(entry);
    }
  }
  writeQueue(remaining);
}
