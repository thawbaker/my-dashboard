import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getUserById, type User } from '@/lib/db';
import { ensureUserDb } from '@/lib/user-db';
import { corsHeaders, type CorsRequest } from '@/lib/cors';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifyToken,
  sessionCookieOptions,
} from '@/lib/token';

// Node-runtime session helpers. Token creation/verification lives in
// ./token.ts (Edge-safe, shared with the middleware); cookie writes go
// through the Response object because in Next.js 15 route handlers the
// cookies() API is read-only.
export { createToken, verifyToken } from '@/lib/token';
export type { SessionPayload } from '@/lib/token';

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function comparePasswords(password: string, hashedPassword: string) {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Current user, re-checked against the DB on every API request.
 * Returns null when: no token, invalid/expired token, user deleted, or
 * user disabled — the last case is what kills live sessions immediately.
 */
export async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE);
  if (!token) return null;

  const payload = await verifyToken(token.value);
  if (!payload) return null;

  const user = getUserById(payload.id);
  if (!user || user.disabled === 1) return null;

  // Self-heal the user's own SQLite DB (user-data/<username>.db): created on
  // login, re-ensured here so sessions that predate the file (or a missing
  // file) still get it. Cheap: a single stat when the file exists.
  ensureUserDb(user.username);

  return user;
}

export type AdminCheck =
  | { ok: true; user: User }
  | { ok: false; error: NextResponse };

/**
 * Admin gate for API routes. Uses the DB role (not the JWT role) so
 * demotions and disables apply immediately.
 */
export async function requireAdmin(req?: CorsRequest): Promise<AdminCheck> {
  const headers = req ? corsHeaders(req) : {};
  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers }),
    };
  }
  if (user.role !== 'admin') {
    return {
      ok: false,
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403, headers }),
    };
  }
  return { ok: true, user };
}

/**
 * Set the session cookie on a route-handler response. (Not the cookies()
 * API — in Next.js 15 route handlers that store is read-only and the
 * browser would never receive the Set-Cookie header.)
 */
export function setSession(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    ...sessionCookieOptions(),
    maxAge: SESSION_TTL_SECONDS, // 30 min — slides forward via the middleware
  });
}

export function clearSession(response: NextResponse) {
  // Empty value + Max-Age=0 tells the browser to drop the cookie; the
  // attributes must match setSession() or the browser won't find it.
  response.cookies.set(SESSION_COOKIE, '', {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
}
