-- Migration number: 0001 	 leaderboard
CREATE TABLE leaderboard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 12),
  days INTEGER NOT NULL CHECK (days BETWEEN 1 AND 999),
  play_ms INTEGER NOT NULL CHECK (play_ms > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_rank ON leaderboard (days DESC, play_ms ASC);
