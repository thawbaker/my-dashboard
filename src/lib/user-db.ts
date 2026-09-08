import { existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Per-user SQLite databases.
//
// Every dashboard user (and admin) owns a SQLite file at
// `user-data/<username>.db` (directory: env USER_DATA_DIR, default
// ./user-data). The file is created on login and self-healed whenever a
// session is resolved — applications on the dashboard (outside of user and
// app maintenance, which stay on the central dashboard DB) use the user's
// own DB.
//
// This module is dependency-free (no import from ./db) so the db layer can
// reuse deriveUsername() in its migration backfill without a cycle.
// ---------------------------------------------------------------------------

/** Directory holding per-user DB files. Resolved once at module load. */
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
 * Absolute path of the user's DB file. Throws on unsafe usernames so a bad
 * value can never escape the user-data directory (no path traversal).
 */
export function userDbPath(username: string): string {
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(`Refusing to create user DB for unsafe username: ${username}`);
  }
  return path.join(USER_DATA_DIR, `${username}.db`);
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

    const db = new Database(file);
    db.pragma('journal_mode = WAL');
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
 * target file already exists (another account) the move is skipped — the
 * old file keeps its data and ensureUserDb() starts a fresh one for the
 * new username. Failures are logged and never block the API request.
 */
export function renameUserDb(oldUsername: string, newUsername: string): void {
  if (oldUsername === newUsername) return;
  try {
    const from = userDbPath(oldUsername);
    const to = userDbPath(newUsername);
    if (!existsSync(from)) return;
    if (existsSync(to)) {
      console.error(
        `Cannot rename user DB '${oldUsername}' -> '${newUsername}': target already exists, old file kept`
      );
      return;
    }
    for (const file of userDbFiles(oldUsername)) {
      if (existsSync(file)) renameSync(file, to + file.slice(from.length));
    }
  } catch (err) {
    console.error(`Failed to rename user DB '${oldUsername}' -> '${newUsername}':`, err);
  }
}

/**
 * Remove the user's DB file (and WAL sidecars) when the account is
 * deleted. Best-effort: logged and never blocking.
 */
export function deleteUserDb(username: string): void {
  try {
    for (const file of userDbFiles(username)) {
      if (existsSync(file)) unlinkSync(file);
    }
  } catch (err) {
    console.error(`Failed to delete user DB for '${username}':`, err);
  }
}
