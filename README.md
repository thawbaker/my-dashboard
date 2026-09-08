# my-dashboard

An app-launcher dashboard with authentication. Built with Next.js 15 (App
Router), TypeScript, better-sqlite3 (raw SQL, no ORM), and shadcn/ui.
Users sign up or are provisioned by an admin, then see a launcher grid of
applications. Admins manage users and apps; access control is a **denylist**
plus an **admin-only** flag — every enabled, non-admin-only app is granted
to every user, admins block apps per user, and admin-only apps are hidden
from every non-admin user. Admins always see and can launch all enabled
apps. Every user (and admin) also owns a personal SQLite database
(`user-data/<username>.db`) that the dashboard's applications use — it is
created on login and self-healed on every authenticated request.

## Tech stack

- **Framework**: Next.js 15.5 (App Router, Turbopack dev)
- **Language**: TypeScript
- **Database**: SQLite via `better-sqlite3`, raw SQL — `db/schema.sql` is the contract
- **Auth**: JWT (jose, 24 h) in an HTTP-only `auth-token` cookie; bcryptjs password hashing
- **Validation**: zod
- **UI**: Tailwind CSS v3 + shadcn/ui (new-york style, zinc, class-based dark mode)

## Getting started

### Prerequisites

- Node.js 18+ (20+ recommended)
- `sqlite3` CLI (optional, for poking at the DB)

### Setup

```bash
npm install
cp .env.local.example .env.local
# edit .env.local:
#   JWT_SECRET   →  openssl rand -base64 32
#   ADMIN_EMAIL / ADMIN_PASSWORD → first-run admin
npm run setup
npm run dev   # http://localhost:3000
```

`npm run setup` runs `db:init` (applies `db/schema.sql`, idempotent) then
`db:seed` (creates the admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` **if no
admin exists**, and inserts the Projects / Analytics / Reports placeholder
apps **if no apps exist**).

Sign in at `/sign-in` with the admin credentials. Public sign-up at
`/sign-up` always creates `role: user` accounts, which start with access to
all enabled apps.

## Scripts

| Script            | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `npm run dev`     | Dev server (Turbopack)                               |
| `npm run build`   | Production build                                     |
| `npm run start`   | Serve the production build                           |
| `npm run lint`    | ESLint                                               |
| `npm run db:init` | Create tables from `db/schema.sql` (idempotent)      |
| `npm run db:seed` | Seed first admin + placeholder apps (no-op if exist) |
| `npm run setup`   | `db:init && db:seed`                                 |

## API

All routes run on the `nodejs` runtime, validate with zod, and return
`{ error, errorType?, errors? }` on failure.

### Auth

| Method | Path              | Description                                                        |
| ------ | ----------------- | ------------------------------------------------------------------ |
| POST   | `/api/auth/sign-up` | Public registration `{ name, username, email, password }` → `role: user`, auto sign-in (cookie). `409 { errorType: 'username_taken' }` on username conflict |
| POST   | `/api/auth/sign-in` | Sign in. Disabled account → `403 { errorType: 'disabled' }`. Ensures the user's personal DB exists      |
| POST   | `/api/auth/logout`  | Clear the session cookie                                          |
| GET    | `/api/auth/me`      | `{ user, apps }` — apps the user can access (admins: all enabled, incl. admin-only; users: enabled − admin-only − denylist) |

### Admin

All admin routes re-check the DB on every call (role **and** disabled
status — demotions and disables apply immediately).

| Method | Path                                | Description                                                        |
| ------ | ----------------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/admin/users`                  | All users, each with `appCount` and `blockedAppIds`                |
| POST   | `/api/admin/users`                  | Create user `{ name, username, email, password, role }` — `409 { errorType: 'username_taken' }` on conflict |
| PATCH  | `/api/admin/users/:id`              | `{ disabled }` — `409` on self-disable or last active admin        |
| PUT    | `/api/admin/users/:id/permissions`  | `{ blockedAppIds: number[] }` — replaces the user's denylist       |
| GET    | `/api/admin/apps`                   | All apps (including disabled), each with `adminOnly`                |
| POST   | `/api/admin/apps`                   | Create app `{ name, url, icon, adminOnly? }` — slug auto-kebab-cased, `409` on dup |
| PATCH  | `/api/admin/apps/:id`               | `{ name?, url?, icon?, enabled?, adminOnly? }` — renaming recomputes the slug |

## Design decisions

### Permissions: denylist (default-allow) + admin-only apps

A row in `user_applications` means the user **cannot** access that app.
Accessible apps, per role:

- **admins** — every enabled app, including `admin_only` ones. The denylist
  does not apply to admins.
- **users** — enabled apps minus `admin_only` apps (hidden by role) minus
  the user's denylist rows.

Consequences:

- New non-admin-only apps are auto-granted to every user — no permission seeding.
- New users need no permission rows at all.
- "Restore default access" is just deleting rows.
- Admin-only apps are locked in the per-user permissions dialog: always
  shown for admins, always hidden for users. The permissions API normalizes
  stored denylists accordingly (drops admin-only ids for users, clears the
  list for admins), so stored state always matches effective access.

### Disable semantics (live-session kill)

`users.disabled` blocks both new sign-ins and live sessions:

- Sign-in for a disabled account → `403 { errorType: 'disabled' }`, checked
  before the password comparison.
- Every authenticated API request re-checks the DB
  (`getSessionUser()` → `getUserById` → `null` when missing or disabled).
  That re-check — not the 24 h JWT — is what revokes live sessions
  immediately.
- Guards: an admin cannot disable their own account; the last active admin
  cannot be disabled. Both return `409`.

### Edge vs Node split of auth checks

- `src/middleware.ts` runs at the edge (no DB access) and gates on the JWT
  only: `/dashboard*` requires a valid token; `/admin*` additionally requires
  `payload.role === 'admin'` (which is why `role` is embedded in the token);
  `/sign-in` and `/sign-up` redirect authenticated visitors to `/dashboard`.
- API routes are authoritative: they re-check the DB on every request, so a
  demotion/disable takes effect immediately. The edge gate is only a fast
  redirect for page navigation.

### CORS

Same-origin by default — no CORS headers are emitted. When `ALLOWED_ORIGINS`
(comma list) is set, matching origins get
`Access-Control-Allow-Origin: <origin>` + `Access-Control-Allow-Credentials:
true` + `Vary: Origin`, and every API route answers OPTIONS preflights with
`204`.

### Per-user databases

Each user (including admins) owns a personal SQLite file at
`USER_DATA_DIR/<username>.db` (default `./user-data/`, gitignored).
User and app **maintenance** — i.e. everything in the central dashboard DB
(users, applications, permissions) — stays on `dashboard.db`; every other
application on the dashboard uses the user's own DB.

- **Filename = `username`**, a unique, filesystem-safe identifier (2–32
  chars: `[a-zA-Z0-9._-]`, must start with a letter or digit). Sign-up and
  admin user creation validate it; pre-existing users had theirs derived
  from the email local part by a self-healing migration
  (`john.doe@example.com` → `john.doe`, deduped with `-2`, `-3`, …).
- **Creation**: on sign-in and sign-up, and lazily re-ensured whenever a
  session is resolved (`getSessionUser()`) — a single `stat` when the file
  already exists, so old sessions or a deleted file heal without a re-login.
  The file is created empty (WAL journaling, so several apps can share it
  concurrently); each application manages its own tables.
- Creation is best-effort: a failure is logged and never blocks login or an
  API request.

### Storage

SQLite via better-sqlite3 (WAL mode, `PRAGMA foreign_keys=ON`). Two layers:

- **Central**: `DATABASE_PATH` (default `./data/dashboard.db`, gitignored) —
  users, applications, permissions. The schema lives in plain SQL
  (`db/schema.sql`); `db:init` runs it idempotently
  (`CREATE ... IF NOT EXISTS`), and `getDb()` applies small self-healing
  migrations for databases created before a column existed. No ORM, no
  migration tool.
- **Per-user**: `USER_DATA_DIR/<username>.db` (default `./user-data/`,
  gitignored) — see [Per-user databases](#per-user-databases).

## Project structure

```
db/schema.sql                # plain-SQL schema contract
scripts/init-db.mjs          # applies the schema (idempotent)
scripts/seed.mjs             # first-run admin + placeholder apps
src/lib/db.ts                # raw better-sqlite3 helpers (users, apps, denylist)
src/lib/user-db.ts           # per-user SQLite DBs (user-data/<username>.db)
src/lib/auth.ts              # JWT, cookie session, getSessionUser, requireAdmin
src/lib/cors.ts              # same-origin default / ALLOWED_ORIGINS preflight
src/lib/validations.ts       # zod schemas
src/middleware.ts            # edge gate (JWT only): /dashboard, /admin, sign-in/up
src/components/ui/           # shadcn/ui primitives
src/components/admin-shell.tsx  # shared chrome for /admin* pages
src/components/app-icon.tsx     # fixed lucide icon set + fallback
src/app/dashboard/           # user launcher grid (+ Admin tile for admins)
src/app/admin/               # function launcher, user mgmt, app mgmt
src/app/api/auth/            # sign-up, sign-in, logout, me
src/app/api/admin/{users,apps}/  # admin API (7 routes)
```
