-- my-dashboard schema contract (plain SQL, idempotent)

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  -- Unique, filesystem-safe identity; the per-user SQLite DB lives at
  -- user-data/<username>.db (created on first login, see src/lib/user-db.ts).
  -- Enforced by idx_users_username (a unique index rather than a table
  -- constraint so the same mechanism works on upgraded DBs, where SQLite
  -- cannot ADD COLUMN ... UNIQUE to a non-empty table).
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  disabled      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS applications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  icon       TEXT NOT NULL DEFAULT 'layout-grid',
  url        TEXT NOT NULL DEFAULT '#',
  enabled    INTEGER NOT NULL DEFAULT 1,
  -- Admin-only apps are hidden from the launcher of every non-admin user.
  -- Admins always see and can launch all enabled apps (admin_only and not).
  admin_only INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Denylist: a row means user CANNOT access app.
-- No rows = full access; new apps are auto-granted.
-- Applies to 'user' role only: admins bypass the denylist and see every
-- enabled app, including admin_only ones.
CREATE TABLE IF NOT EXISTS user_applications (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, app_id)
);

CREATE INDEX IF NOT EXISTS idx_user_apps_user ON user_applications(user_id);
