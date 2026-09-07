import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Raw better-sqlite3 layer (no ORM). Schema contract: db/schema.sql
// ---------------------------------------------------------------------------

export type Role = 'user' | 'admin';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: Role;
  disabled: 0 | 1;
  created_at: string;
}

export interface App {
  id: number;
  name: string;
  slug: string;
  icon: string;
  url: string;
  enabled: 0 | 1;
  created_at: string;
}

let _db: Database.Database | null = null;

/** Lazy singleton connection. Creates ./data/ if missing (default path). */
export function getDb(): Database.Database {
  if (_db) return _db;
  const file = process.env.DATABASE_PATH ?? './data/dashboard.db';
  const dir = path.dirname(file);
  if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
  _db = new Database(file);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  return _db;
}

// --- users -----------------------------------------------------------------

export function createUser(input: {
  email: string;
  passwordHash: string;
  name: string;
  role?: Role;
}): User {
  const info = getDb()
    .prepare(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES (@email, @passwordHash, @name, @role)`
    )
    .run({
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
      role: input.role ?? 'user',
    });
  return getUserById(Number(info.lastInsertRowid))!;
}

export function getUserByEmail(email: string): User | null {
  return (getDb().prepare(`SELECT * FROM users WHERE email = ?`).get(email) ?? null) as
    | User
    | null;
}

export function getUserById(id: number): User | null {
  return (getDb().prepare(`SELECT * FROM users WHERE id = ?`).get(id) ?? null) as User | null;
}

export function listUsers(): User[] {
  return getDb().prepare(`SELECT * FROM users ORDER BY created_at, id`).all() as User[];
}

export function setUserDisabled(id: number, disabled: boolean): void {
  getDb()
    .prepare(`UPDATE users SET disabled = ? WHERE id = ?`)
    .run(disabled ? 1 : 0, id);
}

export function countActiveAdmins(): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0`)
    .get() as { n: number };
  return row.n;
}

// --- applications ----------------------------------------------------------

export function listApps(opts: { enabledOnly?: boolean } = {}): App[] {
  const sql = opts.enabledOnly
    ? `SELECT * FROM applications WHERE enabled = 1 ORDER BY name, id`
    : `SELECT * FROM applications ORDER BY name, id`;
  return getDb().prepare(sql).all() as App[];
}

export function getAppById(id: number): App | null {
  return (
    (getDb().prepare(`SELECT * FROM applications WHERE id = ?`).get(id) ?? null) as App | null
  );
}

export function createApp(input: { name: string; slug: string; icon?: string; url?: string }): App {
  const info = getDb()
    .prepare(
      `INSERT INTO applications (name, slug, icon, url)
       VALUES (@name, @slug, @icon, @url)`
    )
    .run({
      name: input.name,
      slug: input.slug,
      icon: input.icon ?? 'layout-grid',
      url: input.url ?? '#',
    });
  return getAppById(Number(info.lastInsertRowid))!;
}

export function updateApp(
  id: number,
  patch: { name?: string; slug?: string; icon?: string; url?: string; enabled?: boolean }
): App | null {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  if (patch.name !== undefined) {
    sets.push(`name = @name`);
    params.name = patch.name;
  }
  if (patch.slug !== undefined) {
    sets.push(`slug = @slug`);
    params.slug = patch.slug;
  }
  if (patch.icon !== undefined) {
    sets.push(`icon = @icon`);
    params.icon = patch.icon;
  }
  if (patch.url !== undefined) {
    sets.push(`url = @url`);
    params.url = patch.url;
  }
  if (patch.enabled !== undefined) {
    sets.push(`enabled = @enabled`);
    params.enabled = patch.enabled ? 1 : 0;
  }
  if (sets.length > 0) {
    getDb().prepare(`UPDATE applications SET ${sets.join(', ')} WHERE id = @id`).run(params);
  }
  return getAppById(id);
}

// --- permissions (denylist: a row means the user CANNOT access the app) ----

export function getBlockedAppIds(userId: number): number[] {
  const rows = getDb()
    .prepare(`SELECT app_id FROM user_applications WHERE user_id = ? ORDER BY app_id`)
    .all(userId) as { app_id: number }[];
  return rows.map((r) => r.app_id);
}

export function setBlockedAppIds(userId: number, appIds: number[]): void {
  const db = getDb();
  const del = db.prepare(`DELETE FROM user_applications WHERE user_id = ?`);
  const ins = db.prepare(`INSERT OR IGNORE INTO user_applications (user_id, app_id) VALUES (?, ?)`);
  db.transaction((id: number) => {
    del.run(id);
    for (const appId of appIds) ins.run(id, appId);
  })(userId);
}

/** Enabled apps minus the user's denylist rows. New apps are auto-granted. */
export function getAccessibleApps(userId: number): App[] {
  const blocked = new Set(getBlockedAppIds(userId));
  return listApps({ enabledOnly: true }).filter((app) => !blocked.has(app.id));
}
