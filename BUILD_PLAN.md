# Build Plan — my-dashboard

Next.js auth + app-launcher dashboard, patterned after `nidal1111/auth-next-my-app`.
All decisions below were settled in the grilling session (see decision log).

## Decision log

| # | Decision | Choice |
|---|----------|--------|
| 1 | Scaffold | Clone reference repo (`master`), refactor in place |
| 2 | Stack | Next 15 App Router, TS, Tailwind v3, bcryptjs, zod, jose (24h JWT in HTTP-only `auth-token` cookie) |
| 3 | UI | shadcn/ui — new-york style, zinc, class-based dark mode |
| 4 | DB | better-sqlite3, raw SQL, no ORM. File: `./data/dashboard.db` (env `DATABASE_PATH`) |
| 5 | Roles | Single `users` table + `role` column (`user`\|`admin`) |
| 6 | Sign-up | Public self-service → `role=user`, default-full app access |
| 7 | Permissions | `user_applications` = **denylist** (rows = blocked apps). New apps auto-granted (implicit). New users need no rows |
| 8 | First admin | `npm run db:seed` reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| 9 | Disable flag | `disabled` on any user/admin: blocks login **and** kills live sessions (DB re-check on every API request + JWT carries `role` for edge middleware) |
| 10 | CORS | Same-origin default. Env `ALLOWED_ORIGINS` (comma list): if set, echo origin + `credentials: true` + preflight; if empty, no CORS headers |
| 11 | Admin area | Real: **User management** + **App management**. Placeholder tiles: **Settings**, **Audit log** ("coming soon") |
| 12 | User mgmt | List, disable/enable, create user, assign permissions. Guards: no self-disable, last active admin protected. No delete (disabled = off switch) |
| 13 | App mgmt | Create/edit/toggle-enabled; icon = fixed lucide set (dropdown) |
| 14 | Testing | No automated tests; manual verification checklist (phase 7) |
| 15 | Next version | Bump 15.1.8 → latest 15.x (15.5.25), same App Router pattern. No experimental features |

## Schema (contract — `db/schema.sql`, plain SQL)

```sql
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

-- Denylist: a row means user CANNOT access app
CREATE TABLE IF NOT EXISTS user_applications (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, app_id)
);

CREATE INDEX IF NOT EXISTS idx_user_apps_user ON user_applications(user_id);
```

Accessible apps for a user = `applications WHERE enabled=1` MINUS the user's denylist rows.

## Phase 0 — Clone & rebrand

1. `git clone https://github.com/nidal1111/auth-next-my-app /tmp/ref && cp -a /tmp/ref/. my-dashboard/` (dir has only `req.txt`; move it to `docs/req.txt`).
2. `package.json`: name → `my-dashboard`.
3. Commit: "chore: base from auth-next-my-app, rebrand".

**Done when:** `git log` works here; `req.txt` committed under `docs/`.

## Phase 1 — Dependency & layer cleanup

Remove (Drizzle/Postgres/nivo all out):
- `drizzle-orm`, `drizzle-kit`, `@vercel/postgres`, `drizzle.config.ts`, `drizzle.config.prod.ts`
- `src/lib/db/schema.ts`, `src/lib/db/schema.prod.ts`, `scripts/init-db.ts`
- `@nivo/bar`
- `package.json` scripts: drop `db:push*`, `db:studio*`

Keep: `better-sqlite3` + `@types/better-sqlite3`, `jose`, `bcryptjs`, `zod`, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`, `tailwindcss-animate`, existing `@radix-ui/*`.

Bump: `next` → `^15.5.25` (pattern unchanged).

**Done when:** `npm install` clean. (Full build check happens at end of phase 3 — pages still import the old `lib/db`.)

## Phase 2 — Raw SQL DB layer

1. `src/lib/db.ts` — rewrite: lazy singleton
   ```ts
   import Database from 'better-sqlite3';
   // new Database(process.env.DATABASE_PATH ?? './data/dashboard.db')
   // mkdir data/ if missing; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
   ```
   Typed helpers (prepared statements, sync API):
   - users: `createUser({email,passwordHash,name,role})`, `getUserByEmail`, `getUserById`, `setUserDisabled(id, disabled)`, `countActiveAdmins()`
   - apps: `listApps({enabledOnly?})`, `createApp`, `updateApp(id, {name,icon,url,enabled})`
   - perms: `getBlockedAppIds(userId)`, `setBlockedAppIds(userId, appIds[])` (delete-all + insert), `getAccessibleApps(userId)` → enabled apps minus denylist
2. `db/schema.sql` — the contract above.
3. `scripts/init-db.mjs` — `mkdir -p data`, run schema.sql (idempotent).
4. `scripts/seed.mjs` —
   - if 0 admins: require `ADMIN_EMAIL`+`ADMIN_PASSWORD` (else exit 1 with message); insert admin (bcrypt 10 rounds, `role='admin'`)
   - if 0 apps: insert 3 placeholders — **Projects** (`folder`, `#`), **Analytics** (`bar-chart-3`, `#`), **Reports** (`file-text`, `#`)
5. `package.json`: `"db:init"`, `"db:seed"`, `"setup": "db:init && db:seed"`.
6. `.gitignore`: `data/`, `*.db`.

**Done when:** fresh `npm run setup` → `sqlite3 data/dashboard.db '.tables'` shows all 3 tables; admin row present; 3 apps.

## Phase 3 — shadcn/ui

1. `npx shadcn@latest init` → new-york, zinc, CSS variables, class-based dark mode.
   - Contingency: if the latest CLI (4.x) fights Tailwind v3, pin `npx shadcn@2.3.0 init` (v3-compatible).
2. `npx shadcn add`: `button card input label checkbox table dialog select switch badge sonner`.
3. Keep the reference's `password-input.tsx`; restyle on shadcn `Input` (toggle icon via lucide).
4. Ensure `globals.css` dark-mode class strategy + `<html class>` toggling in `layout.tsx` (shadcn default ThemeProvider-free: `suppressHydrationWarning` + class from `prefers-color-scheme` is enough for v1 — no theme switcher UI yet).

**Done when:** `npm run build` passes with old pages intact (they only use Button/Input/Label/PasswordInput).

## Phase 4 — Auth core, API, CORS, middleware

1. `src/lib/auth.ts` (port, extend):
   - JWT payload now `{ id, email, name, role }` (role in token → edge middleware can gate `/admin` without DB)
   - `getSessionUser()`: verify cookie token → `getUserById` → `null` if missing **or `disabled=1`** (this is the live-session kill) → returns full user row
   - `requireAdmin(req)`: `getSessionUser()` + `role==='admin'` (DB role, not JWT role — demotions apply immediately); returns 401/403 response or user
   - Cookie as in reference: `auth-token`, httpOnly, `sameSite=lax`, secure in prod, 24h
2. `src/lib/cors.ts`:
   - `corsHeaders(req)`: if `ALLOWED_ORIGINS` set and `req.origin` in list → `{ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin', ... }`, else `{}` (same-origin: no headers)
   - `handlePreflight(req)`: OPTIONS → 204 + `Allow-Methods/Headers`
   - Apply in every API route handler (top of function)
3. `src/middleware.ts` (edge, jose only — no DB):
   - matcher: `['/dashboard/:path*', '/admin/:path*', '/sign-in', '/sign-up']`
   - `/dashboard*`: valid token else → `/sign-in`
   - `/admin*`: valid token **and `payload.role === 'admin'`** else → `/sign-in`
   - `/sign-in` `/sign-up`: valid token → redirect `/dashboard`
4. API routes (all `export const runtime = 'nodejs'`, zod-validated, error shape `{ error, errorType? }` as in reference):
   - `POST /api/auth/sign-up` — create user `role=user`; no permission rows (denylist: nothing to seed)
   - `POST /api/auth/sign-in` — reject missing/`disabled` user distinctly: `403 {errorType:'disabled'}` before password check for disabled accounts
   - `POST /api/auth/logout` — clear cookie
   - `GET /api/auth/me` — `getSessionUser()` (DB re-check) → `{ user: {id,email,name,role}, apps: getAccessibleApps(user.id) }`
   - Admin (all start with `requireAdmin`):
     - `GET  /api/admin/users` → all users + `appCount` (accessible count)
     - `POST /api/admin/users` — `{name,email,password,role}` (admin-provisioned account)
     - `PATCH /api/admin/users/:id` — `{disabled}` with guards: `409` if target is actor; `409` if target is last active admin
     - `PUT  /api/admin/users/:id/permissions` — `{blockedAppIds: number[]}` → `setBlockedAppIds`
     - `GET  /api/admin/apps` → all apps (with `enabled`)
     - `POST /api/admin/apps` — `{name,url,icon}` (slug = kebab(name), unique)
     - `PATCH /api/admin/apps/:id` — `{name?, url?, icon?, enabled?}`
5. `src/lib/validations.ts`: add `signUpAdminUserSchema`, `appSchema`, `permissionsSchema`, `toggleDisabledSchema`.

**Done when (curl smoke):**
- sign-up → sign-in (cookie jar) → `GET /api/auth/me` returns 3 apps, `role:user`
- seeded admin sign-in → `GET /api/admin/apps` 200; regular user → 403
- admin disables a user → that user's `GET /api/auth/me` immediately 401; sign-in attempt → 403 `disabled`

## Phase 5 — User dashboard (launcher)

`src/app/dashboard/page.tsx` — keep reference's client-fetch pattern (`/api/auth/me` on mount, redirect `/sign-in` on 401), render:
- Nav bar as in reference: title "Dashboard", user name, **Logout** button
- **Launcher grid** (responsive `grid-cols-2 sm:3 lg:4` gap-4): one shadcn `Card` per accessible app → lucide icon (resolved from name, fallback `layout-grid`), app name, `<a href={app.url} target="_blank" rel="noopener noreferrer">` (whole card clickable)
- If `user.role === 'admin'`: extra **Admin** card (icon `shield`, accent border) linking to `/admin`
- Empty state: "No applications yet — ask an admin to add some."
- Loading state as in reference.

**Done when:** user sees 3 placeholder tiles (no admin tile); admin sees 3 + Admin tile; clicking a tile opens its url.

## Phase 6 — Admin area

### 6a. `/admin` — function launcher (matches user-launcher pattern)
Grid of 4 cards (same card style as user launcher):
| Function | Icon | State |
|---|---|---|
| User management | `users` | → `/admin/users` |
| App management | `layout-grid` | → `/admin/apps` |
| Settings | `settings` | placeholder — click → sonner toast "Coming soon" |
| Audit log | `scroll-text` | placeholder — click → sonner toast "Coming soon" |

### 6b. `/admin/users` — user management (real)
- shadcn `Table`: name, email, role (`Badge`), status, accessible-app count
- Per row: `Switch` (enabled) → `PATCH /api/admin/users/:id`; guard failure (409) → error toast, switch snaps back
- Per row: **Permissions** button → `Dialog` with `Checkbox` list of all enabled apps (checked = has access; unchecking = add to denylist) → save → `PUT /api/admin/users/:id/permissions {blockedAppIds}`
- **Create user** button (header) → `Dialog` form: name, email, password, role `Select` (user/admin) → `POST /api/admin/users`
- Client-side only, all mutations via admin API (which re-checks admin+disabled server-side)

### 6c. `/admin/apps` — app management (real)
- `Table` or card grid: icon, name, slug, url, `Switch` (enabled) → `PATCH /api/admin/apps/:id`
- **Add app** button → `Dialog` form: name, url, icon `Select` (fixed lucide set, rendered as labeled options):
  `folder, bar-chart-3, file-text, globe, message-square, calendar, database, lock, mail, settings, users, layout-grid, terminal, cloud, shield, star, bell, layers, image, code`
- Edit button per row → same dialog prefilled

**Done when:** the full manual flow in phase 7 passes.

## Phase 7 — Env, docs, final verification

1. `.env.local.example`:
   ```
   JWT_SECRET=          # openssl rand -base64 32
   ADMIN_EMAIL=         # first-run admin (db:seed)
   ADMIN_PASSWORD=      # first-run admin (db:seed)
   DATABASE_PATH=       # optional, default ./data/dashboard.db
   ALLOWED_ORIGINS=     # optional comma list; empty = same-origin only
   ```
2. `README.md` rewrite: setup (`npm i && npm run setup && npm run dev`), scripts, API table, design decisions (denylist model, disable semantics + why DB re-check, CORS policy, edge-vs-node split of auth checks).
3. Commit per phase as we go; final tag `v0.1.0`.

### Manual verification checklist (the test suite)
- [ ] Fresh clone → `npm i && npm run setup && npm run dev` boots; DB + admin + 3 apps seeded
- [ ] Public sign-up → auto sign-in → launcher shows 3 tiles, **no** admin tile
- [ ] Seeded admin login → 3 tiles **+ Admin** tile → `/admin` shows 4 function tiles (Settings/Audit → "coming soon" toast)
- [ ] Admin creates a user (role user) → that user can sign in
- [ ] Admin unchecks an app for a user → tile disappears from that user's launcher immediately; re-checking restores it
- [ ] Admin creates a 4th app → appears for **all** users incl. existing ones (auto-grant)
- [ ] Admin disables an app → hidden from every launcher
- [ ] Admin disables a user → user's open tab: next action (e.g. refresh/`/me`) bounces to sign-in; login attempt → "account disabled" (403)
- [ ] Guard: admin disabling self → 409 toast; disabling the only active admin → 409 toast
- [ ] Logout → cookie gone, `/dashboard` redirects to sign-in
- [ ] CORS: with `ALLOWED_ORIGINS` unset, cross-origin fetch gets no `Access-Control-Allow-Origin`; with it set, preflight passes and cookie auth works from that origin
- [ ] `npm run build` clean; `npm start` (prod) repeats key flows

## File map (end state, deltas vs reference)

```
db/schema.sql                    NEW   plain SQL contract
scripts/init-db.mjs              NEW   replaces scripts/init-db.ts
scripts/seed.mjs                 NEW   admin + placeholder apps
src/lib/db.ts                    REW   raw better-sqlite3, no Drizzle
src/lib/auth.ts                  EXT   +role in JWT, getSessionUser (DB re-check), requireAdmin
src/lib/cors.ts                  NEW
src/lib/validations.ts           EXT   admin/app/permission schemas
src/middleware.ts                EXT   + /admin* matcher, role gate
src/app/dashboard/page.tsx       REW   launcher grid + admin tile
src/app/admin/page.tsx           NEW   function launcher
src/app/admin/users/page.tsx     NEW   user management
src/app/admin/apps/page.tsx      NEW   app management
src/app/api/auth/*               EXT   disabled handling, /me returns apps
src/app/api/admin/{users,apps}/* NEW   7 routes
drizzle.*, schema.ts, nivo       DEL
```

## Build order (critical path)

Phase 0 → 1 → 2 → 3 → 4 → 5 → 6a → 6b → 6c → 7.
Phases 5 and 6a are parallelizable once 4 is done; 6b/6c depend on 6a's layout only (independent otherwise).
Estimate: 2–3 days focused work.
