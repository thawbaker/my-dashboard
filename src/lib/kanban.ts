import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { userDbPath } from '@/lib/user-db';

export interface ListRow {
  id: number;
  title: string;
  position: number;
  created_at: string;
  archived_at: string | null;
}

export interface CardRow {
  id: number;
  list_id: number;
  title: string;
  description: string;
  position: number;
  created_at: string;
  updated_at: string;
  start_time: string | null;
  end_time: string | null;
  estimated_duration: string | null;
  actual_duration: string | null;
  completed: number;
  assignee: string | null;
  archived_at: string | null;
}

export interface CardLabelRow {
  id: number;
  card_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface WorkSessionRow {
  id: number;
  card_id: number;
  start_time: string;
  end_time: string | null;
  duration: string;
  created_at: string;
}

export interface KanbanListJson {
  id: number;
  title: string;
  position: number;
  createdAt: string;
  archivedAt: string | null;
}

export interface KanbanCardJson {
  id: number;
  listId: number;
  title: string;
  description: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  startTime: string | null;
  endTime: string | null;
  estimatedDuration: string | null;
  actualDuration: string | null;
  completed: boolean;
  activeSessionId: number | null;
  assignee: string | null;
  archivedAt: string | null;
  labels: CardLabelJson[];
}

export interface CardLabelJson {
  id: number;
  cardId: number;
  name: string;
  color: string;
  createdAt: string;
}

export interface WorkSessionJson {
  id: number;
  cardId: number;
  startTime: string;
  endTime: string | null;
  duration: string;
  createdAt: string;
}

export interface ArchivedCardJson extends KanbanCardJson {
  listTitle: string;
}

export interface ArchivedListJson extends KanbanListJson {
  cardCount: number;
}

const connections = new Map<string, DatabaseSync>();

/**
 * BEGIN/COMMIT/ROLLBACK wrapper — node:sqlite has no transaction helper
 * (unlike better-sqlite3's db.transaction()). Rolls back on throw.
 */
function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getKanbanDb(username: string): DatabaseSync {
  const existing = connections.get(username);
  if (existing) return existing;

  const file = userDbPath(username);
  const dir = path.dirname(file);
  if (dir && dir !== '.') mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(file, { timeout: 5000 });
  db.exec('PRAGMA foreign_keys = ON');
  initKanbanSchema(db);
  connections.set(username, db);
  return db;
}

function initKanbanSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kanban_lists (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kanban_cards (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id     INTEGER NOT NULL REFERENCES kanban_lists(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      position    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      start_time  TEXT,
      end_time    TEXT,
      estimated_duration TEXT,
      actual_duration    TEXT,
      completed  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS work_sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id    INTEGER NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
      start_time TEXT NOT NULL,
      end_time   TEXT,
      duration   TEXT NOT NULL DEFAULT '00:00:00',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS card_labels (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id    INTEGER NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_kanban_lists_position
      ON kanban_lists(position, id);

    CREATE INDEX IF NOT EXISTS idx_kanban_cards_list_position
      ON kanban_cards(list_id, position, id);

    CREATE INDEX IF NOT EXISTS idx_work_sessions_card
      ON work_sessions(card_id, id);

    CREATE INDEX IF NOT EXISTS idx_card_labels_card
      ON card_labels(card_id, id);

    CREATE INDEX IF NOT EXISTS idx_card_labels_color
      ON card_labels(color);
  `);

  // Migrate existing databases — add columns that may not exist yet
  const migrateColumns = [
    'start_time TEXT',
    'end_time TEXT',
    'estimated_duration TEXT',
    'actual_duration TEXT',
    'completed INTEGER NOT NULL DEFAULT 0',
    'assignee TEXT',
    'archived_at TEXT',
  ];
  for (const col of migrateColumns) {
    try {
      db.exec(`ALTER TABLE kanban_cards ADD COLUMN ${col}`);
    } catch {
      // Column already exists — ignore
    }
  }
  // Add archived_at to kanban_lists
  try {
    const listCols = db.prepare(`PRAGMA table_info(kanban_lists)`).all() as { name: string }[];
    if (!listCols.some((c) => c.name === 'archived_at')) {
      db.exec(`ALTER TABLE kanban_lists ADD COLUMN archived_at TEXT`);
    }
  } catch {
    // ignore
  }

  // Seed default columns for fresh databases
  const row = db.prepare(`SELECT COUNT(*) AS n FROM kanban_lists`).get() as { n: number };
  if (row.n > 0) return;

  const insert = db.prepare(`INSERT INTO kanban_lists (title, position) VALUES (?, ?)`);
  withTransaction(db, () => {
    insert.run('To Do', 0);
    insert.run('In Progress', 1);
    insert.run('Done', 2);
  });
}

// ── Board ─────────────────────────────────────────────────────────────────────

export function getBoard(username: string): Array<ListRow & { cards: CardRow[] }> {
  const db = getKanbanDb(username);
  const lists = db
    .prepare(
      `SELECT id, title, position, created_at, archived_at
       FROM kanban_lists
       WHERE archived_at IS NULL
       ORDER BY position ASC, id ASC`
    )
    .all() as unknown as (ListRow & { archived_at: string | null })[];
  const cards = db
    .prepare(
      `SELECT id, list_id, title, description, position, created_at, updated_at,
              start_time, end_time, estimated_duration, actual_duration, completed,
              assignee, archived_at
       FROM kanban_cards
       WHERE archived_at IS NULL
       ORDER BY list_id ASC, position ASC, id ASC`
    )
    .all() as unknown as CardRow[];

  const cardsByList = new Map<number, CardRow[]>();
  for (const card of cards) {
    const listCards = cardsByList.get(card.list_id);
    if (listCards) listCards.push(card);
    else cardsByList.set(card.list_id, [card]);
  }

  return lists.map((list) => ({
    ...list,
    cards: cardsByList.get(list.id) ?? [],
  }));
}

// ── Lists ────────────────────────────────────────────────────────────────────

export function createList(username: string, title: string): ListRow {
  const db = getKanbanDb(username);
  const row = db.prepare(`SELECT COALESCE(MAX(position), -1) AS max_pos FROM kanban_lists`).get() as {
    max_pos: number;
  };
  const info = db
    .prepare(`INSERT INTO kanban_lists (title, position) VALUES (?, ?)`)
    .run(title, row.max_pos + 1);

  return db
    .prepare(`SELECT id, title, position, created_at, archived_at FROM kanban_lists WHERE id = ?`)
    .get(Number(info.lastInsertRowid)) as unknown as ListRow;
}

export function renameList(username: string, id: number, title: string): ListRow | null {
  const db = getKanbanDb(username);
  const info = db.prepare(`UPDATE kanban_lists SET title = ? WHERE id = ?`).run(title, id);
  if (info.changes === 0) return null;

  return (
    db.prepare(`SELECT id, title, position, created_at, archived_at FROM kanban_lists WHERE id = ?`).get(id) ??
    null
  ) as ListRow | null;
}

export function deleteList(username: string, id: number): boolean {
  const info = getKanbanDb(username).prepare(`DELETE FROM kanban_lists WHERE id = ?`).run(id);
  return info.changes > 0;
}

export function archiveList(username: string, id: number): boolean {
  const db = getKanbanDb(username);
  return withTransaction(db, () => {
    const now = new Date().toISOString().replace('T', ' ').replace(/\..+$/, '');
    db.prepare(
      `UPDATE kanban_lists SET archived_at = ? WHERE id = ? AND archived_at IS NULL`
    ).run(now, id);
    db.prepare(
      `UPDATE kanban_cards SET archived_at = ? WHERE list_id = ? AND archived_at IS NULL`
    ).run(now, id);
    return true;
  });
}

export function reorderLists(username: string, orderedIds: number[]): boolean {
  const db = getKanbanDb(username);
  return withTransaction(db, () => {
    let ok = true;
    for (let i = 0; i < orderedIds.length; i++) {
      const info = db
        .prepare(`UPDATE kanban_lists SET position = ? WHERE id = ?`)
        .run(i, orderedIds[i]);
      if (info.changes === 0) ok = false;
    }
    return ok;
  });
}

// ── Cards ────────────────────────────────────────────────────────────────────

export function createCard(
  username: string,
  listId: number,
  title: string,
  description = '',
  assignee: string | null = null
): CardRow | null {
  const db = getKanbanDb(username);
  const list = db.prepare(`SELECT id FROM kanban_lists WHERE id = ?`).get(listId) as
    | { id: number }
    | undefined;
  if (!list) return null;

  const row = db
    .prepare(`SELECT COALESCE(MAX(position), -1) AS max_pos FROM kanban_cards WHERE list_id = ?`)
    .get(listId) as { max_pos: number };

  const info = db
    .prepare(`
      INSERT INTO kanban_cards (list_id, title, description, position, assignee)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(listId, title, description, row.max_pos + 1, assignee);

  return db
    .prepare(
      `SELECT id, list_id, title, description, position, created_at, updated_at,
              start_time, end_time, estimated_duration, actual_duration, completed,
              assignee, archived_at
       FROM kanban_cards
       WHERE id = ?`
    )
    .get(Number(info.lastInsertRowid)) as unknown as CardRow;
}

export function updateCard(
  username: string,
  id: number,
  patch: {
    title?: string;
    description?: string;
    estimatedDuration?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    actualDuration?: string | null;
    completed?: boolean;
    assignee?: string | null;
  }
): CardRow | null {
  const db = getKanbanDb(username);
  const existing = db
    .prepare(
      `SELECT id, list_id, title, description, position, created_at, updated_at,
              start_time, end_time, estimated_duration, actual_duration, completed,
              assignee, archived_at
       FROM kanban_cards
       WHERE id = ?`
    )
    .get(id) as CardRow | undefined;
  if (!existing) return null;

  const title = patch.title ?? existing.title;
  const description = patch.description ?? existing.description;
  const startTime = patch.startTime !== undefined ? patch.startTime : existing.start_time;
  const endTime = patch.endTime !== undefined ? patch.endTime : existing.end_time;
  const estimatedDuration = patch.estimatedDuration !== undefined ? patch.estimatedDuration : existing.estimated_duration;
  const actualDuration = patch.actualDuration !== undefined ? patch.actualDuration : existing.actual_duration;
  const completed = patch.completed !== undefined ? (patch.completed ? 1 : 0) : existing.completed;
  const assignee = patch.assignee !== undefined ? patch.assignee : existing.assignee;

  db.prepare(
    `UPDATE kanban_cards
     SET title = ?, description = ?,
         start_time = ?, end_time = ?,
         estimated_duration = ?, actual_duration = ?,
         completed = ?, assignee = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(title, description, startTime, endTime, estimatedDuration, actualDuration, completed, assignee, id);

  return db
    .prepare(
      `SELECT id, list_id, title, description, position, created_at, updated_at,
              start_time, end_time, estimated_duration, actual_duration, completed,
              assignee, archived_at
       FROM kanban_cards
       WHERE id = ?`
    )
    .get(id) as unknown as CardRow;
}

export function deleteCard(username: string, id: number): boolean {
  const info = getKanbanDb(username).prepare(`DELETE FROM kanban_cards WHERE id = ?`).run(id);
  return info.changes > 0;
}

export function archiveCard(username: string, id: number): boolean {
  const db = getKanbanDb(username);
  const now = new Date().toISOString().replace('T', ' ').replace(/\..+$/, '');
  const info = db
    .prepare(`UPDATE kanban_cards SET archived_at = ? WHERE id = ? AND archived_at IS NULL`)
    .run(now, id);
  return info.changes > 0;
}

export function moveCard(
  username: string,
  id: number,
  targetListId: number,
  position: number
): 'ok' | 'card-not-found' | 'list-not-found' {
  const db = getKanbanDb(username);
  return withTransaction(db, () => {
    const card = db
      .prepare(`SELECT id, list_id, position FROM kanban_cards WHERE id = ?`)
      .get(id) as { id: number; list_id: number; position: number } | undefined;
    if (!card) return 'card-not-found' as const;

    const targetList = db
      .prepare(`SELECT id FROM kanban_lists WHERE id = ?`)
      .get(targetListId) as { id: number } | undefined;
    if (!targetList) return 'list-not-found' as const;

    const targetCountRow = db
      .prepare(
        `SELECT COUNT(*) AS n
         FROM kanban_cards
         WHERE list_id = ? AND id != ?`
      )
      .get(targetListId, id) as { n: number };
    const nextPosition = Math.min(position, targetCountRow.n);

    if (card.list_id === targetListId) {
      if (nextPosition < card.position) {
        db.prepare(
          `UPDATE kanban_cards
           SET position = position + 1
           WHERE list_id = ? AND position >= ? AND position < ? AND id != ?`
        ).run(targetListId, nextPosition, card.position, id);
      } else if (nextPosition > card.position) {
        db.prepare(
          `UPDATE kanban_cards
           SET position = position - 1
           WHERE list_id = ? AND position > ? AND position <= ? AND id != ?`
        ).run(targetListId, card.position, nextPosition, id);
      }
    } else {
      db.prepare(
        `UPDATE kanban_cards
         SET position = position - 1
         WHERE list_id = ? AND position > ?`
      ).run(card.list_id, card.position);

      db.prepare(
        `UPDATE kanban_cards
         SET position = position + 1
         WHERE list_id = ? AND position >= ?`
      ).run(targetListId, nextPosition);
    }

    db.prepare(
      `UPDATE kanban_cards
       SET list_id = ?, position = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(targetListId, nextPosition, id);

    return 'ok' as const;
  });
}

// ── Archive ──────────────────────────────────────────────────────────────────

export function restoreArchived(username: string, id: number, kind: 'card' | 'list'): boolean {
  const db = getKanbanDb(username);
  if (kind === 'list') {
    return withTransaction(db, () => {
      db.prepare(
        `UPDATE kanban_lists SET archived_at = NULL WHERE id = ? AND archived_at IS NOT NULL`
      ).run(id);
      db.prepare(
        `UPDATE kanban_cards SET archived_at = NULL WHERE list_id = ? AND archived_at IS NOT NULL`
      ).run(id);
      return true;
    });
  }
  const info = db
    .prepare(`UPDATE kanban_cards SET archived_at = NULL WHERE id = ? AND archived_at IS NOT NULL`)
    .run(id);
  return info.changes > 0;
}

export function permanentlyDeleteArchived(username: string, id: number, kind: 'card' | 'list'): boolean {
  const db = getKanbanDb(username);
  if (kind === 'list') {
    return withTransaction(db, () => {
      db.prepare(`DELETE FROM kanban_cards WHERE list_id = ? AND archived_at IS NOT NULL`).run(id);
      const info = db
        .prepare(`DELETE FROM kanban_lists WHERE id = ? AND archived_at IS NOT NULL`)
        .run(id);
      return info.changes > 0;
    });
  }
  const info = db
    .prepare(`DELETE FROM kanban_cards WHERE id = ? AND archived_at IS NOT NULL`)
    .run(id);
  return info.changes > 0;
}

export function getArchivedItems(username: string): {
  lists: Array<ListRow & { archived_at: string; cardCount: number }>;
  cards: Array<CardRow & { listTitle: string }>;
} {
  const db = getKanbanDb(username);
  const lists = db
    .prepare(
      `SELECT id, title, position, created_at, archived_at
       FROM kanban_lists
       WHERE archived_at IS NOT NULL
       ORDER BY archived_at DESC`
    )
    .all() as unknown as (ListRow & { archived_at: string })[];

  const listsWithCounts = lists.map((list) => ({
    ...list,
    cardCount: (db
      .prepare(`SELECT COUNT(*) AS n FROM kanban_cards WHERE list_id = ? AND archived_at IS NOT NULL`)
      .get(list.id) as { n: number }).n,
  }));

  const cards = db
    .prepare(
      `SELECT c.id, c.list_id, c.title, c.description, c.position,
              c.created_at, c.updated_at,
              c.start_time, c.end_time, c.estimated_duration, c.actual_duration,
              c.completed, c.assignee, c.archived_at,
              l.title AS listTitle
       FROM kanban_cards c
       LEFT JOIN kanban_lists l ON l.id = c.list_id
       WHERE c.archived_at IS NOT NULL
       ORDER BY c.archived_at DESC`
    )
    .all() as unknown as (CardRow & { listTitle: string })[];

  return { lists: listsWithCounts, cards };
}

// ── Labels ───────────────────────────────────────────────────────────────────

export function addLabel(
  username: string,
  cardId: number,
  name: string,
  color: string
): CardLabelRow | null {
  const db = getKanbanDb(username);
  const info = db
    .prepare(`INSERT INTO card_labels (card_id, name, color) VALUES (?, ?, ?)`)
    .run(cardId, name, color);
  return db
    .prepare(`SELECT id, card_id, name, color, created_at FROM card_labels WHERE id = ?`)
    .get(Number(info.lastInsertRowid)) as unknown as CardLabelRow | null;
}

export function removeLabel(username: string, labelId: number): boolean {
  const info = getKanbanDb(username)
    .prepare(`DELETE FROM card_labels WHERE id = ?`)
    .run(labelId);
  return info.changes > 0;
}

export function getCardLabels(username: string, cardId: number): CardLabelRow[] {
  return getKanbanDb(username)
    .prepare(`SELECT id, card_id, name, color, created_at FROM card_labels WHERE card_id = ? ORDER BY id ASC`)
    .all(cardId) as unknown as CardLabelRow[];
}

// ── JSON serialization ───────────────────────────────────────────────────────

export function listJson(row: ListRow): KanbanListJson {
  return {
    id: row.id,
    title: row.title,
    position: row.position,
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? null,
  };
}

export function cardJson(row: CardRow, activeSessionId: number | null = null, labels: CardLabelJson[] = []): KanbanCardJson {
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    description: row.description,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    estimatedDuration: row.estimated_duration ?? null,
    actualDuration: row.actual_duration ?? null,
    completed: row.completed === 1,
    activeSessionId,
    assignee: row.assignee ?? null,
    archivedAt: row.archived_at ?? null,
    labels,
  };
}

export function labelJson(row: CardLabelRow): CardLabelJson {
  return {
    id: row.id,
    cardId: row.card_id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  };
}

export function workSessionJson(row: WorkSessionRow): WorkSessionJson {
  return {
    id: row.id,
    cardId: row.card_id,
    startTime: row.start_time,
    endTime: row.end_time ?? null,
    duration: row.duration,
    createdAt: row.created_at,
  };
}

// ── Time-tracking helpers ────────────────────────────────────────────────────

export function hmsToSeconds(hms: string | null | undefined): number {
  if (!hms) return 0;
  const parts = hms.split(':').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function secondsToHms(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function addDurations(a: string | null | undefined, b: string | null | undefined): string {
  return secondsToHms(hmsToSeconds(a) + hmsToSeconds(b));
}

export function diffDurations(a: string | null | undefined, b: string | null | undefined): string {
  const sDiff = hmsToSeconds(a) - hmsToSeconds(b);
  const abs = Math.abs(sDiff);
  const hh = Math.floor(abs / 3600);
  const mm = Math.floor((abs % 3600) / 60);
  const ss = abs % 60;
  const sign = sDiff < 0 ? '-' : '+';
  return `${sign}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function getActiveSession(db: DatabaseSync, cardId: number): WorkSessionRow | null {
  const row = db
    .prepare(
      `SELECT id, card_id, start_time, end_time, duration, created_at
       FROM work_sessions
       WHERE card_id = ? AND end_time IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get(cardId) as WorkSessionRow | undefined;
  return row ?? null;
}

export function startWorkSession(username: string, cardId: number): WorkSessionRow | null {
  const db = getKanbanDb(username);
  return withTransaction(db, () => {
    const card = db
      .prepare(`SELECT id, start_time FROM kanban_cards WHERE id = ?`)
      .get(cardId) as { id: number; start_time: string | null } | undefined;
    if (!card) return null;

    const active = getActiveSession(db, cardId);
    if (active) return null;

    const now = new Date().toISOString().replace('T', ' ').replace(/\..+$/, '');

    if (!card.start_time) {
      db.prepare(
        `UPDATE kanban_cards SET start_time = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(now, cardId);
    }

    const info = db
      .prepare(`INSERT INTO work_sessions (card_id, start_time) VALUES (?, ?)`)
      .run(cardId, now);

    return db
      .prepare(
        `SELECT id, card_id, start_time, end_time, duration, created_at
         FROM work_sessions WHERE id = ?`
      )
      .get(Number(info.lastInsertRowid)) as unknown as WorkSessionRow;
  });
}

export function pauseWorkSession(
  username: string,
  cardId: number,
  explicitDuration?: string
): WorkSessionRow | null {
  const db = getKanbanDb(username);
  return withTransaction(db, () => {
    const active = getActiveSession(db, cardId);
    if (!active) return null;

    const now = new Date().toISOString().replace('T', ' ').replace(/\..+$/, '');
    const duration = explicitDuration ?? calcDurationHms(active.start_time, now);

    db.prepare(
      `UPDATE work_sessions SET end_time = ?, duration = ? WHERE id = ?`
    ).run(now, duration, active.id);

    const card = db
      .prepare(`SELECT actual_duration FROM kanban_cards WHERE id = ?`)
      .get(cardId) as { actual_duration: string | null };
    const newActual = addDurations(card.actual_duration, duration);
    db.prepare(
      `UPDATE kanban_cards SET actual_duration = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(newActual, cardId);

    return db
      .prepare(
        `SELECT id, card_id, start_time, end_time, duration, created_at
         FROM work_sessions WHERE id = ?`
      )
      .get(active.id) as unknown as WorkSessionRow;
  });
}

export function heartbeatWorkSession(
  username: string,
  cardId: number,
  duration: string
): WorkSessionRow | null {
  const db = getKanbanDb(username);
  const active = getActiveSession(db, cardId);
  if (!active) return null;

  db.prepare(`UPDATE work_sessions SET duration = ? WHERE id = ?`).run(duration, active.id);

  const allCompleted = db
    .prepare(
      `SELECT COALESCE(SUM(
        CAST(substr(duration,1,2) AS INTEGER)*3600 +
        CAST(substr(duration,4,2) AS INTEGER)*60 +
        CAST(substr(duration,7,2) AS INTEGER)
      ), 0) AS total
       FROM work_sessions WHERE card_id = ? AND id != ? AND end_time IS NOT NULL`
    )
    .get(cardId, active.id) as { total: number };
  const newActual = secondsToHms(allCompleted.total + hmsToSeconds(duration));
  db.prepare(
    `UPDATE kanban_cards SET actual_duration = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(newActual, cardId);

  return db
    .prepare(
      `SELECT id, card_id, start_time, end_time, duration, created_at
       FROM work_sessions WHERE id = ?`
    )
    .get(active.id) as unknown as WorkSessionRow;
}

export function completeCard(username: string, cardId: number): CardRow | null {
  const db = getKanbanDb(username);
  return withTransaction(db, () => {
    const card = db
      .prepare(
        `SELECT id, start_time, end_time, actual_duration, completed
         FROM kanban_cards WHERE id = ?`
      )
      .get(cardId) as CardRow | undefined;
    if (!card) return null;
    if (card.completed) return card as unknown as CardRow;

    const now = new Date().toISOString().replace('T', ' ').replace(/\..+$/, '');

    const active = getActiveSession(db, cardId);
    if (active) {
      const duration = calcDurationHms(active.start_time, now);
      db.prepare(
        `UPDATE work_sessions SET end_time = ?, duration = ? WHERE id = ?`
      ).run(now, duration, active.id);

      const newActual = addDurations(card.actual_duration, duration);
      db.prepare(
        `UPDATE kanban_cards SET end_time = ?, actual_duration = ?,
         completed = 1, updated_at = datetime('now') WHERE id = ?`
      ).run(now, newActual, cardId);
    } else {
      db.prepare(
        `UPDATE kanban_cards SET end_time = ?, completed = 1,
         updated_at = datetime('now') WHERE id = ?`
      ).run(now, cardId);
    }

    return db
      .prepare(
        `SELECT id, list_id, title, description, position, created_at, updated_at,
                start_time, end_time, estimated_duration, actual_duration, completed,
                assignee, archived_at
         FROM kanban_cards WHERE id = ?`
      )
      .get(cardId) as unknown as CardRow;
  });
}

export function calcDurationHms(startStr: string, endStr: string): string {
  const start = new Date(startStr.replace(' ', 'T') + 'Z').getTime();
  const end = new Date(endStr.replace(' ', 'T') + 'Z').getTime();
  const diffMs = Math.max(0, end - start);
  return secondsToHms(Math.floor(diffMs / 1000));
}