# API Routes

Next.js 15 App Router route handlers for auth, admin, and the built-in Kanban
board.

## Shared conventions

- Runtime: `nodejs`
- Auth: JWT in the HTTP-only `auth-token` cookie
- Session authority: every authenticated route re-checks the user in SQLite on
  every request via `getSessionUser()`
- CORS: same-origin by default; optional allowlist via `ALLOWED_ORIGINS`
- Validation: zod
- Error shape: `{ error, errorType?, errors? }`
- Preflight: every route supports `OPTIONS`

## Route groups

### `/api/auth/*`

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/api/auth/sign-up` | Public registration `{ name, username, email, password }`; auto sign-in |
| POST | `/api/auth/sign-in` | Sign in; disabled accounts return `403 { errorType: 'disabled' }` |
| POST | `/api/auth/logout` | Clear the session cookie |
| GET | `/api/auth/me` | Current `{ user, apps }`; also used by the dashboard/kanban heartbeat |

### `/api/admin/*`

Admin routes call `requireAdmin()` and therefore apply live DB role/disabled
checks on every request.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/admin/users` | List users with `appCount` and `blockedAppIds` |
| POST | `/api/admin/users` | Create a user |
| PATCH | `/api/admin/users/:id` | Edit user fields or disable/enable |
| DELETE | `/api/admin/users/:id` | Delete a user and their personal DB |
| POST | `/api/admin/users/:id/password` | Set a user's password |
| PUT | `/api/admin/users/:id/permissions` | Replace a user's denylist |
| GET | `/api/admin/apps` | List all apps |
| POST | `/api/admin/apps` | Create an app |
| PATCH | `/api/admin/apps/:id` | Edit an app |

### `/api/kanban/*`

The Kanban board belongs to the **session user only**. No route accepts a user
identifier; all reads and writes go to `user-data/<username>.db` through
`src/lib/kanban.ts`.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/kanban` | Full board `{ lists }` |
| POST | `/api/kanban/lists` | Create list `{ title }` |
| PUT | `/api/kanban/lists/:id` | Rename list `{ title }` |
| DELETE | `/api/kanban/lists/:id` | Delete list and cascade cards |
| POST | `/api/kanban/cards` | Create card `{ listId, title, description? }` |
| PUT | `/api/kanban/cards/:id` | Update card `{ title?, description? }` |
| DELETE | `/api/kanban/cards/:id` | Delete card |
| POST | `/api/kanban/cards/:id/move` | Move card `{ targetListId, position }` |

## Per-user isolation

- Central dashboard state lives in `data/dashboard.db`
- Each user also has `user-data/<username>.db`
- Kanban tables are namespaced inside that personal DB:
  - `kanban_lists`
  - `kanban_cards`
- First access auto-applies the schema and seeds `To Do`, `In Progress`, and
  `Done` when the board is empty

## Verification notes

Current manual verification covers:

- unauthenticated `/kanban` redirect + `/api/kanban` 401
- default board seed for new users
- list/card create + card move
- separate boards for separate users
- admin disable of the Kanban app removes the launcher tile
- disabling a user forces `/api/kanban` back to 401 immediately
