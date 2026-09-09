import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { userDbPath } from '@/lib/user-db';

export interface ListRow {
  id: number;
  title: string;
  position: number;
  created_at: string;
}

export interface CardRow {
  id: number;
  list_id: number;
  title: string;
  description: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface KanbanListJson {
  id: number;
  title: string;
  position: number;
  createdAt: string;
}

export interface KanbanCardJson {
  id: number;
  listId: number;
  title: string;
  description: string;
  position: number;
  createdAt: string;
  updatedAt: string;
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

  // node:sqlite has no pragma() helper: busy_timeout becomes the constructor
  // `timeout` option (ms); other PRAGMAs go through exec()
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
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_kanban_lists_position
      ON kanban_lists(position, id);

    CREATE INDEX IF NOT EXISTS idx_kanban_cards_list_position
      ON kanban_cards(list_id, position, id);
  `);

  const row = db.prepare(`SELECT COUNT(*) AS n FROM kanban_lists`).get() as { n: number };
  if (row.n > 0) return;

  const insert = db.prepare(`INSERT INTO kanban_lists (title, position) VALUES (?, ?)`);
  withTransaction(db, () => {
    insert.run('To Do', 0);
    insert.run('In Progress', 1);
    insert.run('Done', 2);
  });
}

export function getBoard(username: string): Array<ListRow & { cards: CardRow[] }> {
  const db = getKanbanDb(username);
  const lists = db
    .prepare(`SELECT id, title, position, created_at FROM kanban_lists ORDER BY position ASC, id ASC`)
    .all() as unknown as ListRow[];
  const cards = db
    .prepare(
      `SELECT id, list_id, title, description, position, created_at, updated_at
       FROM kanban_cards
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

export function createList(username: string, title: string): ListRow {
  const db = getKanbanDb(username);
  const row = db.prepare(`SELECT COALESCE(MAX(position), -1) AS max_pos FROM kanban_lists`).get() as {
    max_pos: number;
  };
  const info = db
    .prepare(`INSERT INTO kanban_lists (title, position) VALUES (?, ?)`)
    .run(title, row.max_pos + 1);

  return db
    .prepare(`SELECT id, title, position, created_at FROM kanban_lists WHERE id = ?`)
    .get(Number(info.lastInsertRowid)) as unknown as ListRow;
}

export function renameList(username: string, id: number, title: string): ListRow | null {
  const db = getKanbanDb(username);
  const info = db.prepare(`UPDATE kanban_lists SET title = ? WHERE id = ?`).run(title, id);
  if (info.changes === 0) return null;

  return (
    db.prepare(`SELECT id, title, position, created_at FROM kanban_lists WHERE id = ?`).get(id) ??
    null
  ) as ListRow | null;
}

export function deleteList(username: string, id: number): boolean {
  const info = getKanbanDb(username).prepare(`DELETE FROM kanban_lists WHERE id = ?`).run(id);
  return info.changes > 0;
}

export function createCard(
  username: string,
  listId: number,
  title: string,
  description = ''
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
      INSERT INTO kanban_cards (list_id, title, description, position)
      VALUES (?, ?, ?, ?)
    `)
    .run(listId, title, description, row.max_pos + 1);

  return db
    .prepare(
      `SELECT id, list_id, title, description, position, created_at, updated_at
       FROM kanban_cards
       WHERE id = ?`
    )
    .get(Number(info.lastInsertRowid)) as unknown as CardRow;
}

export function updateCard(
  username: string,
  id: number,
  patch: { title?: string; description?: string }
): CardRow | null {
  const db = getKanbanDb(username);
  const existing = db
    .prepare(
      `SELECT id, list_id, title, description, position, created_at, updated_at
       FROM kanban_cards
       WHERE id = ?`
    )
    .get(id) as CardRow | undefined;
  if (!existing) return null;

  const title = patch.title ?? existing.title;
  const description = patch.description ?? existing.description;

  db.prepare(
    `UPDATE kanban_cards
     SET title = ?, description = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(title, description, id);

  return db
    .prepare(
      `SELECT id, list_id, title, description, position, created_at, updated_at
       FROM kanban_cards
       WHERE id = ?`
    )
    .get(id) as unknown as CardRow;
}

export function deleteCard(username: string, id: number): boolean {
  const info = getKanbanDb(username).prepare(`DELETE FROM kanban_cards WHERE id = ?`).run(id);
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

export function listJson(row: ListRow): KanbanListJson {
  return {
    id: row.id,
    title: row.title,
    position: row.position,
    createdAt: row.created_at,
  };
}

export function cardJson(row: CardRow): KanbanCardJson {
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    description: row.description,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
