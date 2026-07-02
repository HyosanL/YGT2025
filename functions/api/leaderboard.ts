/**
 * 온라인 리더보드 API (Cloudflare Pages Functions + D1)
 * GET  /api/leaderboard → 상위 50개 (days DESC, play_ms ASC)
 * POST /api/leaderboard → { nickname, days, play_ms } 등록
 */
interface Env {
  DB: D1Database;
}

const TOP_LIMIT = 50;
const NICK_MIN = 1;
const NICK_MAX = 12;
const DAYS_MIN = 1;
const DAYS_MAX = 999;
/** 1일차당 최소 플레이 시간 — 말도 안 되는 기록 차단 */
const MIN_MS_PER_DAY = 15_000;
/** 1일차당 최대 플레이 시간 (24시간) — 오버플로/장난 값 차단 */
const MAX_MS_PER_DAY = 24 * 60 * 60 * 1000;

const BANNED_WORDS = ['시발', '씨발', '병신', '개새', '지랄', 'fuck', 'shit', 'admin', '운영자'];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function bad(message: string, status = 400): Response {
  return json({ ok: false, error: message }, status);
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    'SELECT nickname, days, play_ms, created_at FROM leaderboard ORDER BY days DESC, play_ms ASC LIMIT ?'
  )
    .bind(TOP_LIMIT)
    .all();
  return json({ ok: true, entries: results });
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

  // 등록 직후 순위 계산 (동률 시 play_ms 짧은 쪽이 상위)
  const rankRow = await env.DB.prepare(
    'SELECT COUNT(*) AS better FROM leaderboard WHERE days > ?1 OR (days = ?1 AND play_ms < ?2)'
  )
    .bind(days, play_ms)
    .first<{ better: number }>();

  return json({ ok: true, rank: (rankRow?.better ?? 0) + 1 });
};
