/**
 * 온라인 리더보드 API (Cloudflare Pages Functions + D1)
 * GET  /api/leaderboard?me=닉네임 → 상위 50개 + (옵션) 내 최고 기록/순위
 * POST /api/leaderboard → { nickname, days, play_ms } 등록
 *
 * 정렬: 일차 높은 순 → 같은 일차면 '오래 버틴' 순 (play_ms DESC).
 * 예) 7일차 15초 > 7일차 14초 > 6일차 15초
 */
interface Env {
  DB: D1Database;
}

const TOP_LIMIT = 50;
const NICK_MIN = 1;
const NICK_MAX = 12;
const DAYS_MIN = 1;
const DAYS_MAX = 999;
/** 1일차당 최소 플레이 시간 — 말도 안 되는 기록 차단.
 *  템포 개편(한 판 7~12초, 1일차 즉사 가능)을 감안해 느슨하게. */
const MIN_MS_PER_DAY = 2_000;
/** 1일차당 최대 플레이 시간 (24시간) — 오버플로/장난 값 차단 */
const MAX_MS_PER_DAY = 24 * 60 * 60 * 1000;

const BANNED_WORDS = ['시발', '씨발', '병신', '개새', '지랄', 'fuck', 'shit', 'admin', '운영자'];

/** 닉네임별 최고 기록에 rn=1을 붙이는 공통 서브쿼리 */
const BEST_CTE = `
  SELECT nickname, days, play_ms, created_at,
         ROW_NUMBER() OVER (PARTITION BY nickname ORDER BY days DESC, play_ms DESC) AS rn
  FROM leaderboard
`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function bad(message: string, status = 400): Response {
  return json({ ok: false, error: message }, status);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const me = (url.searchParams.get('me') ?? '').trim();

  // 닉네임별 최고 기록 1건만 노출
  const { results } = await env.DB.prepare(
    `SELECT nickname, days, play_ms, created_at FROM (${BEST_CTE})
     WHERE rn = 1
     ORDER BY days DESC, play_ms DESC
     LIMIT ?`
  )
    .bind(TOP_LIMIT)
    .all();

  // 내 최고 기록 + 전체(닉네임 중복 제거) 기준 순위
  let meInfo: { rank: number; days: number; play_ms: number } | null = null;
  if (me.length >= NICK_MIN && me.length <= NICK_MAX) {
    const mine = await env.DB.prepare(
      `SELECT days, play_ms FROM (${BEST_CTE}) WHERE rn = 1 AND nickname = ?`
    )
      .bind(me)
      .first<{ days: number; play_ms: number }>();
    if (mine) {
      const better = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM (${BEST_CTE})
         WHERE rn = 1 AND (days > ?1 OR (days = ?1 AND play_ms > ?2))`
      )
        .bind(mine.days, mine.play_ms)
        .first<{ c: number }>();
      meInfo = { rank: (better?.c ?? 0) + 1, days: mine.days, play_ms: mine.play_ms };
    }
  }

  return json({ ok: true, entries: results, me: meInfo });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('invalid json body');
  }

  const { nickname, days, play_ms } = (body ?? {}) as {
    nickname?: unknown;
    days?: unknown;
    play_ms?: unknown;
  };

  if (typeof nickname !== 'string') return bad('nickname required');
  const nick = nickname.trim();
  if (nick.length < NICK_MIN || nick.length > NICK_MAX) {
    return bad(`nickname must be ${NICK_MIN}-${NICK_MAX} chars`);
  }
  const lowered = nick.toLowerCase();
  if (BANNED_WORDS.some((w) => lowered.includes(w))) {
    return bad('nickname not allowed');
  }

  if (typeof days !== 'number' || !Number.isInteger(days) || days < DAYS_MIN || days > DAYS_MAX) {
    return bad('invalid days');
  }
  if (typeof play_ms !== 'number' || !Number.isInteger(play_ms) || play_ms <= 0) {
    return bad('invalid play_ms');
  }
  if (play_ms < days * MIN_MS_PER_DAY) return bad('play time too short for days');
  if (play_ms > days * MAX_MS_PER_DAY) return bad('play time too long');

  await env.DB.prepare('INSERT INTO leaderboard (nickname, days, play_ms) VALUES (?, ?, ?)')
    .bind(nick, days, play_ms)
    .run();

  // 등록 직후 순위 계산 — 닉네임 중복 제거 기준, 같은 일차면 오래 버틴 쪽이 상위.
  // 내 과거 기록이 나를 밀어내지 않도록 자기 닉네임은 제외.
  const rankRow = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM (${BEST_CTE})
     WHERE rn = 1 AND nickname != ?1 AND (days > ?2 OR (days = ?2 AND play_ms > ?3))`
  )
    .bind(nick, days, play_ms)
    .first<{ c: number }>();

  return json({ ok: true, rank: (rankRow?.c ?? 0) + 1 });
};
