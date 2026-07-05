-- Migration number: 0002 	 순위 기준 변경: 같은 일차면 오래 버틴(play_ms 긴) 쪽이 상위
DROP INDEX IF EXISTS idx_rank;
CREATE INDEX idx_rank ON leaderboard (days DESC, play_ms DESC);
