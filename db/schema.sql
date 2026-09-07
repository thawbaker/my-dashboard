-- my-dashboard schema contract (plain SQL, idempotent)

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  disabled      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  icon       TEXT NOT NULL DEFAULT 'layout-grid',
  url        TEXT NOT NULL DEFAULT '#',
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Denylist: a row means user CANNOT access app.
-- No rows = full access; new apps are auto-granted.
CREATE TABLE IF NOT EXISTS user_applications (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, app_id)
);

CREATE INDEX IF NOT EXISTS idx_user_apps_user ON user_applications(user_id);
