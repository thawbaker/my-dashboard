// Initialize the SQLite database: mkdir -p data/ + apply db/schema.sql (idempotent).
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import { DatabaseSync } from 'node:sqlite';

dotenv.config({ path: '.env.local' });
dotenv.config();

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(projectRoot, 'data', 'dashboard.db');
const schemaPath = path.join(projectRoot, 'db', 'schema.sql');

mkdirSync(path.dirname(dbPath), { recursive: true });

const schema = readFileSync(schemaPath, 'utf8');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);
db.close();

console.log(`Database initialized at ${dbPath}`);
