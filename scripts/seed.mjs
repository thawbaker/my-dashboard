// Seed the dashboard: first admin (ADMIN_EMAIL/ADMIN_PASSWORD) + placeholder apps.
// Idempotent: only acts when 0 admins / 0 apps. Run `npm run db:init` first.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(projectRoot, 'data', 'dashboard.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- first admin -------------------------------------------------------------
const adminCount = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`).get().n;
if (adminCount === 0) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error(
      'No admin exists. Set ADMIN_EMAIL and ADMIN_PASSWORD (e.g. in .env.local) and re-run `npm run db:seed`.'
    );
    process.exit(1);
  }

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  const passwordHash = await bcrypt.hash(password, 10);
  if (existing) {
    // Re-run with an existing (non-admin) account: promote it.
    db.prepare(`UPDATE users SET role = 'admin', password_hash = ? WHERE id = ?`).run(
      passwordHash,
      existing.id
    );
    console.log(`Promoted existing user ${email} to admin.`);
  } else {
    db.prepare(`INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'admin')`).run(
      email,
      passwordHash,
      email,
    );
    console.log(`Created admin ${email}.`);
  }
} else {
  console.log(`Admin already present (${adminCount}); skipping admin seed.`);
}

// --- placeholder apps ----------------------------------------------------------
const appCount = db.prepare(`SELECT COUNT(*) AS n FROM applications`).get().n;
if (appCount === 0) {
  const insert = db.prepare(
    `INSERT INTO applications (name, slug, icon, url) VALUES (?, ?, ?, '#')`
  );
  const apps = [
    ['Projects', 'projects', 'folder'],
    ['Analytics', 'analytics', 'bar-chart-3'],
    ['Reports', 'reports', 'file-text'],
  ];
  db.transaction(() => {
    for (const [name, slug, icon] of apps) insert.run(name, slug, icon);
  })();
  console.log(`Seeded ${apps.length} placeholder apps: ${apps.map((a) => a[0]).join(', ')}.`);
} else {
  console.log(`Apps already present (${appCount}); skipping app seed.`);
}

db.close();
console.log('Seed complete.');
