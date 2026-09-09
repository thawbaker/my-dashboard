# Build Plan — Kanban (OpenKanban integration)

Integrate the functionality and design of [clawnify/OpenKanban](https://github.com/clawnify/OpenKanban) (v3.0.0, MIT) as a first-class app in my-dashboard's app-launching framework:

- **No Hono.** The board runs on our Next.js 15 API route handlers, fully conforming to the existing security pattern (edge middleware gate, `getSessionUser()` DB re-check on every request, CORS headers + preflight, zod validation, house error shapes).
- **Per-user data.** Every user (and admin) owns their board in their assigned SQLite file `user-data/<username>.db` — namespaced tables `kanban_lists` / `kanban_cards`, session-user-only access (no cross-user surface).
- **Faithful UI port.** The Preact client is ported 1:1 to React 19 (same components, raw HTML5 drag-and-drop, dual human/agent mode, 8-color header rotation, original CSS — scoped under `.kanban-root` so its global reset cannot leak into the host app), extended to follow the host app's light/dark theme.

Source of truth for the port: repo **v3.0.0** (the Clawnify/D1 rewrite). Its README describes the older local variant; where the two diverge ("seeds a default board", "list reordering") we follow the **actual v3 code**, with one deliberate exception: the default-board seed is restored by decision K5.

## Decision log

Settled in a two-round grilling session; all recommendations accepted.

| # | Decision | Choice |
|---|----------|--------|
| K1 | App registration | Idempotent slug-ensure in `scripts/seed.mjs`: name `Kanban`, slug `kanban`, icon `kanban`, url `/kanban`, enabled, **not** admin-only (auto-granted to every user). Add `kanban` to the fixed lucide icon set in `app-icon.tsx`. |
| K2 | Mount points | Page `/kanban` (middleware matcher + client `/api/auth/me` check); API namespace `/api/kanban/*` with board = `GET /api/kanban`; endpoint paths/verbs mirror OpenKanban 1:1 (its `GET /api/lists` becomes the board endpoint). |
| K3 | Wire format | Full conversion to house conventions: camelCase fields (`listId`, `createdAt`), `{list}`/`{card}`/`{ok}`/`{lists}` wrappers, zod 400 `{error, errors:[{field,message}]}`, `corsHeaders()` + OPTIONS preflight on every route, generic 500 message (no leak). |
| K4 | Data layer | New `src/lib/kanban.ts`: per-username better-sqlite3 connection cache (lazy; `userDbPath()` safety guard; `PRAGMA foreign_keys=ON` + `busy_timeout` per connection), idempotent schema apply on first access, namespaced tables, strict session-user isolation. |
| K5 | First-run board | Seed `To Do` / `In Progress` / `Done` (positions 0–2) when `kanban_lists` is empty (restores the behavior the v3 README claims but v3 code dropped). |
| K6 | UI port | Faithful React 19 port; keep OpenKanban's CSS, scoped under `.kanban-root` (global reset contained). |
| K7 | Agent mode | Keep dual mode: `?agent=true` (and legacy `?mode=agent` alias) — no drag-and-drop, "Move to…" dropdowns, always-visible labeled forms, explicit rename buttons. |
| K8 | Page chrome | Ported toolbar (`Kanban Board` + `Add List`) + `← Dashboard` back link + existing `ThemeToggle`. |
| K9 | Session UX in the tab | Ported `api()` helper: 401 → `window.location.replace('/sign-in')`; plus the dashboard's 5-minute `/api/auth/me` heartbeat so an idle tab notices an expired session early. |
| K10 | Scope boundary | Strictly one board per user; **no** admin cross-user view/export/reset endpoints; no user identifier in any endpoint. |
| K11 | Testing & docs | House convention: no automated tests, manual verification checklist against the production build. Plan lives in this file (`docs/kanban-build-plan.md`); implementation starts only on explicit approval (K14). |
| K12 | Theming | Theme-following: `html.dark .kanban-root` variable overrides (canvas/cards/text/borders/shadows tuned to the shadcn zinc dark palette); the 8 saturated header colors stay in both modes; `ThemeToggle` in the toolbar. |
| K13 | Input limits | List title 1–100, card title 1–200, card description 0–2000 — all zod, house 400 shape. |
| K14 | Delivery | Write this plan and stop; implementation proceeds phase-by-phase on approval, committing per phase (house style). |

## Architecture

```
Launcher tile (applications row: slug=kanban, url=/kanban — opens in a new tab)
        │
        ▼
/kanban  (edge middleware gate: no token → /sign-in)
        │   client: KanbanBoard (React port); agent mode via ?agent=true
        ▼
/api/kanban*   (Next route handlers, nodejs runtime)
        │   getSessionUser() → User | null  (DB re-check: deleted/disabled → null)
        │   zod validation · corsHeaders · house error shapes
        ▼
src/lib/kanban.ts  →  user-data/<username>.db   (kanban_lists, kanban_cards)
```

**Ownership invariant:** the board belongs to the session user. No endpoint accepts a user identifier, so a user can never read or write another user's board. Direct-URL access to `/kanban` is open to any authenticated user — they only ever reach their own board; accepted, consistent with the "apps are launcher tiles, not permissions" model (a disabled app hides the tile, the page still loads for its own data).

## Data model (per user DB)

```sql
-- Applied idempotently by src/lib/kanban.ts on first access.
-- User DB files start empty (ensureUserDb creates them table-less;
-- see src/lib/user-db.ts). Namespaced so future apps sharing the same
-- file cannot collide.
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
```

Column layout is identical to OpenKanban v3 (semantics ported 1:1); namespacing and explicit `NOT NULL` are the only deltas. First-run seed (K5): when `kanban_lists` is empty, insert `To Do` / `In Progress` / `Done` at positions 0/1/2.

### Position semantics (ported as-is)

- Append (new list / new card) = `COALESCE(MAX(position), -1) + 1` (scoped to the list for cards).
- Move (drag-drop to end of a list, or agent "Move to…") runs in one transaction:
  1. `UPDATE kanban_cards SET position = position + 1 WHERE list_id = :target AND position >= :pos AND id != :cardId`
  2. `UPDATE kanban_cards SET list_id = :target, position = :pos, updated_at = datetime('now') WHERE id = :cardId`
- `updated_at` refreshes on card edit and on move. A move position beyond the current max simply appends (client always sends the target list's card count — same as v3).

## API contract

Auth: `getSessionUser()` on every route → **401** `{error: "Unauthorized"}` (covers anonymous, expired, deleted, and disabled users — live session invalidation comes for free). Every route: `export const runtime = 'nodejs'`, `OPTIONS` → `preflightResponse`, `corsHeaders()` on every response, zod body validation → **400** `{error, errors:[{field,message}]}`, unknown id → **404**, unexpected error → **500** `{error: "Internal server error"}` (message never leaked).

Field shapes (camelCase):

```ts
KanbanList          = { id: number; title: string; position: number; createdAt: string }
KanbanCard          = { id: number; listId: number; title: string; description: string;
                        position: number; createdAt: string; updatedAt: string }
KanbanListWithCards = KanbanList & { cards: KanbanCard[] }
```

| Method | Path | Body | Success | Errors |
|--------|------|------|---------|--------|
| GET | `/api/kanban` | — | 200 `{ lists: KanbanListWithCards[] }` | 401, 500 |
| POST | `/api/kanban/lists` | `{ title }` | 201 `{ list }` | 400, 401, 500 |
| PUT | `/api/kanban/lists/:id` | `{ title }` | 200 `{ list }` | 400, 401, 404, 500 |
| DELETE | `/api/kanban/lists/:id` | — | 200 `{ ok: true }` | 401, 404, 500 |
| POST | `/api/kanban/cards` | `{ listId, title, description? }` | 201 `{ card }` | 400, 401, 404 (list), 500 |
| PUT | `/api/kanban/cards/:id` | `{ title?, description? }` (≥1 field) | 200 `{ card }` | 400, 401, 404, 500 |
| DELETE | `/api/kanban/cards/:id` | — | 200 `{ ok: true }` | 401, 404, 500 |
| POST | `/api/kanban/cards/:id/move` | `{ targetListId, position }` | 200 `{ ok: true }` | 400, 401, 404 (card or target list), 500 |

Zod schemas added to `src/lib/validations.ts` (K13 limits):

```ts
kanbanCreateListSchema = { title: z.string().min(1, 'Title is required').max(100) }
kanbanUpdateListSchema = { title: z.string().min(1, 'Title is required').max(100) }
kanbanCreateCardSchema = { listId: z.number().int().positive(),
                           title: z.string().min(1, 'Title is required').max(200),
                           description: z.string().max(2000).optional() }
kanbanUpdateCardSchema = { title?: z.string().min(1).max(200),
                           description?: z.string().max(2000) }
                        .refine(v => Object.keys(v).length > 0, { message: 'No fields to update' })
kanbanMoveCardSchema   = { targetListId: z.number().int().positive(),
                           position: z.number().int().min(0) }
```

Trim semantics (ported): validate the raw value, trim server-side; a title that is empty **after** trim → 400 `"Title is required"` in the house shape.

## Data layer — `src/lib/kanban.ts`

```ts
// Connection cache: one better-sqlite3 handle per username per server process.
// Lazy. The file always exists by the time a route runs (ensureUserDb
// self-heals it in getSessionUser), but open() creates missing files
// defensively, same as ensureUserDb.
const connections = new Map<string, Database.Database>();

export function getKanbanDb(username: string): Database.Database
// 1. userDbPath(username) — throws on unsafe names (no traversal; see user-db.ts)
// 2. open once, cached; PRAGMA foreign_keys=ON (per-connection — required for
//    ON DELETE CASCADE) and PRAGMA busy_timeout=5000
// 3. initKanbanSchema(db) — idempotent DDL + K5 first-run seed

export function getBoard(username: string): (ListRow & { cards: CardRow[] })[]
export function createList(username: string, title: string): ListRow          // position = max+1
export function renameList(username: string, id: number, title: string): ListRow | null
export function deleteList(username: string, id: number): boolean             // FK cascade removes cards
export function createCard(username: string, listId: number, title: string,
                           description?: string): CardRow | null              // null = list not found
export function updateCard(username: string, id: number,
                           patch: { title?: string; description?: string }): CardRow | null
export function deleteCard(username: string, id: number): boolean
export function moveCard(username: string, id: number, targetListId: number,
                         position: number): 'ok' | 'card-not-found' | 'list-not-found'

// camelCase JSON mappers shared by all kanban routes (house pattern, cf. appJson)
export function listJson(row: ListRow): KanbanListJson
export function cardJson(row: CardRow): KanbanCardJson
```

Row types are snake_case at the lib boundary (matching `db.ts`); route handlers map to camelCase via the JSON mappers (matching the `admin/apps` pattern).

Notes:
- `PRAGMA foreign_keys` is per-connection in SQLite — it must be set on **every** open; this is what makes list-delete cascade cards.
- WAL journaling is a persistent file property (set by `ensureUserDb` at creation), so no per-connection journal setup is needed; `busy_timeout` covers cross-connection write contention (two tabs of one user share the single cached connection in-process).
- No connection eviction (scale: one file per user, few users; single Node process in prod). Revisit if the fleet grows. In dev, Turbopack HMR may re-import the module; better-sqlite3 handles GC'd handles and WAL sidecars make reopening safe.

## UI port — Preact → React 19

| OpenKanban (Preact) | my-dashboard (React) | Port notes |
|---|---|---|
| `client/main.tsx` | — | Dropped (Next renders via `src/app/kanban/page.tsx`) |
| `client/app.tsx` | `src/components/kanban/kanban-board.tsx` | Root client component; `window.location.search` in `useMemo` → `useSearchParams()` (requires a `<Suspense>` wrapper in the page — below); the `data-agent` `<html>` attribute effect is kept |
| `client/types.ts` | `kanban/types.ts` | camelCase fields |
| `client/api.ts` | `kanban/api.ts` | Fetch paths → `/api/kanban*`; **401 → `window.location.replace('/sign-in')`** (K9); all other errors surface to the ported error banner |
| `client/context.tsx` | `kanban/context.tsx` | `createContext` / `useContext` from `react` (API-compatible, no changes) |
| `client/hooks/use-board.ts` | `kanban/hooks/use-board.ts` | 1:1 (`list_id` → `listId` in fetch bodies); gains the session heartbeat (below) |
| `client/hooks/use-drag.ts` | `kanban/hooks/use-drag.ts` | `JSX.TargetedDragEvent` → `React.DragEvent`; raw HTML5 DnD logic unchanged |
| 11 component files | `kanban/components/*.tsx` | `class`→`className`, `onInput`→`onChange`, `for=`→`htmlFor=`, `lucide-preact`→`lucide-react` (already a dependency); toolbar gains the `← Dashboard` link + `ThemeToggle` (K8) |
| `client/styles.css` | `kanban/kanban.css` | Every selector scoped under `.kanban-root` (including the `* { margin:0; padding:0 }` reset → `.kanban-root *`); `body` rules move to `.kanban-root`; `:root` vars become `.kanban-root` vars; `html.dark .kanban-root` override block added (K12); `data-agent` rules unchanged |

Component inventory (ported 1:1): `kanban-board`, `toolbar`, `board`, `list`, `list-header`, `card-list`, `card`, `card-menu`, `card-agent-actions`, `list-footer`, `confirm-bar`, `error-banner`.

`src/app/kanban/page.tsx` (server component):

```tsx
import { Suspense } from 'react';
import { KanbanBoard } from '@/components/kanban/kanban-board';

export default function KanbanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <KanbanBoard />
    </Suspense>
  );
}
```

`KanbanBoard` renders `<div className="kanban-root">…</div>` as its outermost element and imports `kanban.css`. The scoped reset makes the page fully self-contained: nothing leaks out, and the host layout (Geist font vars, next-themes class on `<html>`) is the only shared surface.

**Session UX (K9).** `use-board.ts` gains the dashboard's 5-minute `/api/auth/me` heartbeat: 401 → `window.location.replace('/sign-in')`, fetch failure (server down) silently ignored, `visibilitychange` skips the beat on hidden tabs. Active users never need it — every kanban API call already slides the token via the middleware's `/api/*` renewal; the heartbeat exists so an *idle* tab self-redirects instead of stalling on the next click.

**Theming (K12).** Dark overrides live in one block, `html.dark .kanban-root`, reassigning: `--bg`, `--card-bg`, `--text`, `--text-secondary`, `--border`, `--shadow`, `--shadow-lg` (values tuned to the shadcn zinc dark palette used by the dashboard). The 8 rotating header colors are saturated and stay identical in both modes. The ported toolbar includes the existing `ThemeToggle`, so a user can flip light/dark inside the tab; next-themes persists the choice host-wide.

**Agent mode (K7).** Unchanged semantics: `?agent=true` (or `?mode=agent`) disables the drag handlers, swaps the hover card menu for an always-visible labeled action row with a "Move to…" `<select>` (cards + "Move to end of list" sentinel), keeps list-footer forms always visible with persistent labels, and replaces inline list rename with an explicit "Rename" button. `data-agent` attribute on `<html>` drives the CSS hooks. Built for AI browser agents (OpenClaw); costs nothing to keep.

## Phases

Commit per phase as we go (K14).

### Phase 1 — Data layer & validation
1. `src/lib/kanban.ts` per the spec above: connection cache, idempotent DDL + K5 seed, 8 CRUD helpers, `listJson` / `cardJson`, row types.
2. `src/lib/validations.ts`: the five kanban schemas (K13 limits).

No UI, no routes yet.

**Done when:** `npm run build` and `npm run lint` clean.

### Phase 2 — API routes (`/api/kanban/*`)
Six route files per the contract table. Every file: `runtime = 'nodejs'`, `OPTIONS` preflight, `getSessionUser()` 401 gate, zod 400, 404s (unknown id; unknown list on card create/move), camelCase mappers, generic 500.

**Done when (curl smoke with a signed-in cookie jar):**
- No cookie → 401 on all 8 endpoints
- `GET /api/kanban` → the 3 seeded lists, no cards
- Create list → 201 with `position` = max+1; rename → 200; delete → `{ ok: true }` (cards cascade away)
- Create card (bad `listId` → 404); partial edit (unspecified field untouched); move (target positions shift correctly; move within same list; position beyond end appends; negative position → 400)
- Title over limit / empty-after-trim → 400 with `errors[]`
- Two accounts: A creates a list; B's `GET /api/kanban` never shows it (separate DB file)

### Phase 3 — Launcher registration & edge gate
1. `src/components/app-icon.tsx`: + `Kanban` icon (lucide-react), `'kanban'` added to `APP_ICON_NAMES`.
2. `scripts/seed.mjs`: idempotent ensure after the existing app seed — `SELECT id FROM applications WHERE slug = 'kanban'`; insert (name `Kanban`, icon `kanban`, url `/kanban`) when missing. Independent of the "0 apps" guard so it also runs on databases that already have apps.
3. `src/middleware.ts`: matcher + `'/kanban/:path*'`; gate exactly like `/dashboard` (no token → `/sign-in`).
4. Run `npm run db:seed` to register the app row.

**Done when:** `curl -I /kanban` (no cookie) → 307 to `/sign-in`; `GET /api/auth/me` for a regular user includes the `kanban` app; the launcher renders the tile.

### Phase 4 — UI port (React)
1. `src/components/kanban/`: `types.ts`, `api.ts` (401 redirect), `context.tsx`, `hooks/use-board.ts` (+ heartbeat), `hooks/use-drag.ts`, the 11 components, `kanban.css` (scoped + dark block).
2. `src/app/kanban/page.tsx` (Suspense wrapper).

Faithful conversion per the mapping table; no behavior changes beyond K7–K9 and K12.

**Done when:** `npm run build` clean; dev flow: tile opens the board in a new tab (3 seeded lists); full CRUD in human mode with working drag-and-drop; `?agent=true` and `?mode=agent` both render the agent UI correctly; dark OS theme → dark board, toolbar `ThemeToggle` flips in place; `← Dashboard` returns to the launcher.

### Phase 5 — Docs & final verification
1. `README.md`: Kanban section (auto-registered app, per-user DB, agent-mode URL, how to hide the app via the admin UI).
2. `src/app/api/README.md`: kanban endpoint table + per-user isolation note.
3. Run the checklist below against the production build.

### Manual verification checklist (the test suite, per K11)
Run against `npm run build` + `npm start` (production):

- [ ] Fresh: `npm i && npm run setup && npm run build && npm start` — seed ensures the `kanban` app row; re-running `npm run db:seed` does not duplicate it
- [ ] Launcher: `Kanban` tile (kanban icon) visible to regular users and admin; admin disables the app → tile disappears (direct `/kanban` URL still loads — accepted, own data only)
- [ ] `/kanban` with no session → `/sign-in` (edge); after sign-in → board with To Do / In Progress / Done
- [ ] Human mode: add / rename / delete list (inline confirm bar), add / edit / delete card (hover menu, inline edit, delete confirm), drag a card between lists — order correct after refresh
- [ ] Agent mode: `?agent=true` — no drag, "Move to…" dropdowns move correctly, labeled always-visible forms, explicit rename button; `?mode=agent` alias works
- [ ] Isolation: account B never sees account A's lists or cards (API and UI); each user's rows live only in their own `user-data/<username>.db`
- [ ] Security: disable a user → their kanban APIs return 401 immediately (live session invalidation); admin user gets their own ordinary board (no admin-only surface)
- [ ] Session: kanban tab open, delete the `auth-token` cookie in DevTools → next board action redirects to `/sign-in`; heartbeat keeps an idle-open tab alive within the 30-minute sliding window
- [ ] Themes: dark OS theme → dark board; light → light; toolbar `ThemeToggle` flips in place and persists
- [ ] Validation & edge: 400 shapes (oversize title, empty title, negative position, empty update body), 404s (unknown id, missing list), CORS same-origin behavior unchanged
- [ ] `npm run build` clean, 0 lint warnings; key flows re-run under `npm start` (production), not just dev

## File map (end state)

```
scripts/seed.mjs                             EXT   + idempotent kanban app ensure (slug=kanban)
src/middleware.ts                            EXT   + /kanban/:path* matcher + token gate
src/components/app-icon.tsx                  EXT   + 'kanban' icon in the fixed set
src/lib/kanban.ts                            NEW   per-user kanban data layer (conn cache, DDL, CRUD, JSON mappers)
src/lib/validations.ts                       EXT   5 kanban schemas (K13 limits)
src/app/api/kanban/route.ts                  NEW   GET /api/kanban (board)
src/app/api/kanban/lists/route.ts            NEW   POST /api/kanban/lists
src/app/api/kanban/lists/[id]/route.ts       NEW   PUT / DELETE /api/kanban/lists/:id
src/app/api/kanban/cards/route.ts            NEW   POST /api/kanban/cards
src/app/api/kanban/cards/[id]/route.ts       NEW   PUT / DELETE /api/kanban/cards/:id
src/app/api/kanban/cards/[id]/move/route.ts  NEW   POST /api/kanban/cards/:id/move
src/app/kanban/page.tsx                      NEW   server wrapper (Suspense) → KanbanBoard
src/components/kanban/                       NEW   types, api, context, 2 hooks, 12 components, kanban.css (scoped + dark)
README.md                                    EXT   kanban section
src/app/api/README.md                        EXT   kanban API section
docs/kanban-build-plan.md                    NEW   this plan
```

Untouched (reused as-is): `db/schema.sql` (central DB), `src/lib/{db,auth,token,cors,user-db}.ts`, all existing routes/pages.

## Build order (critical path)

Phase 1 → 2 → 4 → 5, with Phase 3 slottable anywhere after Phase 1 (it is independent of both the API and the UI). Estimate: ~2 focused days (data layer + API ≈ 0.5d, UI port ≈ 1d, verification/docs ≈ 0.5d).

## Explicit non-goals

- **No list reordering** — v3 code has no list-move endpoint or UI (the README's "reorder columns" is stale). Future extension: `PUT /api/kanban/lists/:id/move` + draggable list headers.
- Single board per user; no board naming/selection.
- No admin cross-user board view / export / reset (K10 — isolation by design).
- No labels, tags, due dates, WIP limits, attachments, or multi-user collaboration (none in v3).
- No rate limiting (not in the house pattern today).
- No automated tests (K11 — house convention).
