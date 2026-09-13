import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// ---------------------------------------------------------------------------
// Per-user SQLite databases.
//
// Every dashboard user (and admin) owns a SQLite file at
// `user-data/<username>/<username>.db` (directory: env USER_DATA_DIR, default
// ./user-data). The file is created on login and self-healed whenever a
// session is resolved — applications on the dashboard (outside of user and
// app maintenance, which stay on the central dashboard DB) use the user's
// own DB.
//
// This module is dependency-free (no import from ./db) so the db layer can
// reuse deriveUsername() in its migration backfill without a cycle.
// ---------------------------------------------------------------------------

/** Directory holding per-user DB subdirectories. Resolved once at module load. */
export const USER_DATA_DIR: string = process.env.USER_DATA_DIR ?? './user-data';

/**
 * Character set allowed in usernames (= the per-user DB filename stem).
 * Filesystem-safe on POSIX + Windows: letters, digits, dot, dash,
 * underscore; must start with a letter or digit; 2–32 chars. This is the
 * single source of truth — the zod schema in ./validations must match it.
 */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}$/i;

/** Derive a safe username from an email: lowercased local part, junk stripped. */
export function deriveUsername(email: string): string {
  const local = email.split('@')[0] ?? email;
  let s = local.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  s = s.replace(/^[.\-]+/, '');
  s = s.slice(0, 32).replace(/[.\-]+$/, '');
  return s || 'user';
}

/**
 * Absolute path of the user's DB file, now in a per-user subdirectory:
 *   ./user-data/<username>/<username>.db
 *
 * Throws on unsafe usernames so a bad value can never escape the user-data
 * directory (no path traversal).
 */
export function userDbPath(username: string): string {
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(`Refusing to create user DB for unsafe username: ${username}`);
  }
  return path.join(USER_DATA_DIR, username, `${username}.db`);
}

/**
 * Ensure the user's DB file exists; create it (empty, WAL journaling) if
 * missing. Best-effort: logs and returns null on failure so a problem with
 * the user-data directory never blocks login or API requests.
 *
 * Cheap to call per request: when the file exists this is a single stat.
 * WAL lets several apps open the same file concurrently.
 */
export function ensureUserDb(username: string): string | null {
  try {
    const file = userDbPath(username);
    const dir = path.dirname(file);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
    if (existsSync(file)) return file;

    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL');
    db.close();
    return file;
  } catch (err) {
    console.error(`Failed to ensure user DB for '${username}':`, err);
    return null;
  }
}

/** All on-disk files that make up the user's DB (main + WAL sidecars). */
function userDbFiles(username: string): string[] {
  const base = userDbPath(username);
  return ['', '-wal', '-shm'].map((suffix) => base + suffix);
}

/**
 * Move the user's DB file when their username changes. Best-effort: if the
 * target directory/file already exists (another account) the move is skipped
 * — the old file keeps its data and ensureUserDb() starts a fresh one for
 * the new username. Failures are logged and never block the API request.
 */
export function renameUserDb(oldUsername: string, newUsername: string): void {
  if (oldUsername === newUsername) return;
  try {
    const fromDir = path.join(USER_DATA_DIR, oldUsername);
    const toDir = path.join(USER_DATA_DIR, newUsername);
    const from = userDbPath(oldUsername);

    if (!existsSync(from)) return;
    if (existsSync(userDbPath(newUsername))) {
      console.error(
        `Cannot rename user DB '${oldUsername}' -> '${newUsername}': target already exists, old data kept`
      );
      return;
    }

    // Create the target directory
    mkdirSync(toDir, { recursive: true });

    // Move all sidecar files into the new directory
    for (const suffix of ['', '-wal', '-shm']) {
      const src = path.join(fromDir, `${oldUsername}.db${suffix}`);
      if (existsSync(src)) renameSync(src, path.join(toDir, `${newUsername}.db${suffix}`));
    }

    // Remove the old (now-empty) directory
    try { rmSync(fromDir, { recursive: true, force: true }); } catch { /* ignore */ }
  } catch (err) {
    console.error(`Failed to rename user DB '${oldUsername}' -> '${newUsername}':`, err);
  }
}

/**
 * Remove the user's entire data directory (DB file, WAL sidecars, and any
 * other data the user may have accumulated) when the account is deleted.
 * Best-effort: logged and never blocking.
 */
export function deleteUserDb(username: string): void {
  try {
    const dir = path.join(USER_DATA_DIR, username);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`Failed to delete user DB for '${username}':`, err);
  }
}

// ---------------------------------------------------------------------------
// One-time legacy migration: move DB files from the old flat layout
//   user-data/{username}.db → user-data/{username}/{username}.db
// ---------------------------------------------------------------------------

/**
 * Migrate any user DB files still in the flat `user-data/<username>.db`
 * layout to the new `user-data/<username>/<username>.db` subdirectory layout.
 *
 * Called once at server startup (from the main db module) — idempotent and
 * safe to call repeatedly. Best-effort: failures are logged, never crash.
 */
export function migrateLegacyUserDbs(): void {
  try {
    if (!existsSync(USER_DATA_DIR)) return;

    const entries = readdirSync(USER_DATA_DIR, { withFileTypes: true });

    for (const entry of entries) {
      // Only process files named like a DB (must match username pattern)
      if (!entry.isFile()) continue;
      const name = entry.name;
      // Strip known extensions: .db, .db-wal, .db-shm
      const stem = name.replace(/\.db(-wal|-shm)?$/, '');
      if (stem === name) continue; // no .db extension — skip
      if (!USERNAME_PATTERN.test(stem)) continue;

      const oldDir = path.join(USER_DATA_DIR, stem);
      if (existsSync(oldDir)) {
        // Already migrated — clean up the old flat file if it's orphaned
        try { unlinkSync(path.join(USER_DATA_DIR, name)); } catch { /* ignore */ }
        continue;
      }

      // Move the DB file(s) into the new subdirectory
      const targetDir = path.join(USER_DATA_DIR, stem);
      mkdirSync(targetDir, { recursive: true });

      for (const suffix of ['', '-wal', '-shm'] as const) {
        const flatFile = path.join(USER_DATA_DIR, `${stem}.db${suffix}`);
        if (existsSync(flatFile)) {
          renameSync(flatFile, path.join(targetDir, `${stem}.db${suffix}`));
        }
      }
    }
  } catch (err) {
    console.error('Legacy user DB migration failed:', err);
  }
}