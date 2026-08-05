-- 004_sessions.sql — PLAN 8.1: session tokens for login/logout. token is the
-- bearer credential the frontend holds in memory (ARCHITECTURE.md §9), so it
-- must be unique and fast to look up; expires_at bounds how long a stolen or
-- forgotten token stays valid.

CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  token       TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);
