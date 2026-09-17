import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:3000';
const OUT = 'public/screenshots';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});

const page = await context.newPage();

// ── 1. Login page ──
console.log('📸 Capturing sign-in page...');
await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
await page.waitForSelector('form');
await page.fill('input[type="email"]', 'admin@example.com');
await page.fill('input[type="password"]', '••••••••');
await page.screenshot({ path: `${OUT}/login.png`, fullPage: false });
console.log('   ✓ login.png');

// ── 2. Sign in via the form ──
console.log('🔐 Signing in as admin...');
await page.fill('input[type="email"]', 'thawby@gmail.com');
await page.fill('input[type="password"]', 'oscar');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 10000 });
console.log('   ✓ Signed in to dashboard');

// ── 3. Navigate to kanban and seed data via the browser's own fetch API ──
// This way cookies are automatically included
console.log('📦 Seeding kanban data...');

// Navigate to kanban first so we're on the right domain for fetch
await page.goto(`${BASE}/kanban`, { waitUntil: 'networkidle' });

// Use page.evaluate to create lists and cards via native fetch (cookies auto-sent)
const listIds = await page.evaluate(async () => {
  const lists = ['To Do', 'In Progress', 'In Review', 'Done'];
  const ids = [];
  for (const title of lists) {
    const res = await fetch('/api/kanban/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    ids.push(data.list.id);
  }
  return ids;
});
console.log(`   Created lists: ${listIds.join(', ')}`);

const cardCount = await page.evaluate(async (listIds) => {
  const cards = [
    { listIdx: 0, title: 'Design dashboard layout', desc: 'Create wireframes for the main dashboard grid' },
    { listIdx: 0, title: 'Set up CI/CD pipeline', desc: 'Configure GitHub Actions for automated testing' },
    { listIdx: 0, title: 'Write API documentation' },
    { listIdx: 1, title: 'Implement user authentication', desc: 'JWT-based auth with refresh tokens' },
    { listIdx: 1, title: 'Build kanban drag && drop' },
    { listIdx: 2, title: 'Review pull request #42' },
    { listIdx: 2, title: 'Test file upload feature' },
    { listIdx: 3, title: 'Deploy to staging', desc: 'v0.1.0 release candidate' },
    { listIdx: 3, title: 'Write migration guide' },
  ];
  let count = 0;
  for (const c of cards) {
    const body = { listId: listIds[c.listIdx], title: c.title };
    if (c.desc) body.description = c.desc;
    const res = await fetch('/api/kanban/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) count++;
  }
  return count;
}, listIds);
console.log(`   Created ${cardCount} cards`);

// ── 4. Refresh kanban board screenshot ──
console.log('📸 Capturing kanban board...');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.kanban-root', { timeout: 10000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/kanban-board.png`, fullPage: false });
console.log('   ✓ kanban-board.png');

// ── 5. Task timer screenshot ──
console.log('📸 Capturing task timer...');

// Hover over the first card
const firstCard = page.locator('[data-card-id]').first();
await firstCard.hover();
await page.waitForTimeout(300);

// Click the three-dot menu button
const menuBtn = page.locator('.card-menu-btn').first();
if (await menuBtn.isVisible()) {
  await menuBtn.click();
  await page.waitForTimeout(400);
}

// Click Edit in the dropdown
const editBtn = page.locator('.card-actions.open button').filter({ hasText: 'Edit' }).first();
if (await editBtn.isVisible()) {
  await editBtn.click();
  await page.waitForTimeout(500);
}

// Click Work in the inline form
const workBtn = page.locator('button').filter({ hasText: 'Work' }).first();
if (await workBtn.isVisible()) {
  await workBtn.click();
  await page.waitForTimeout(800);
}

// Wait for timer dialog and start it
try {
  await page.waitForSelector('.timer-dialog', { timeout: 5000 });
  const startBtn = page.locator('.timer-btn-start');
  if (await startBtn.isVisible()) {
    await startBtn.click();
    await page.waitForTimeout(4000); // Let it tick a few seconds
  }
  await page.screenshot({ path: `${OUT}/task-timer.png`, fullPage: false });
  console.log('   ✓ task-timer.png');
} catch {
  console.log('   ⚠ Timer dialog did not appear');
  await page.screenshot({ path: `${OUT}/task-timer.png`, fullPage: false });
}

await browser.close();
console.log('✅ All screenshots saved to public/screenshots/');