import { SignJWT, jwtVerify } from 'jose';

/**
 * Edge-safe session token utilities (jose only — no node: modules, no DB).
 * Shared by the Node runtime (src/lib/auth.ts) and the Edge middleware
 * (src/middleware.ts).
 *
 * Session model — 30-minute sliding expiration:
 *  - every token (and its cookie) lives for exactly 30 minutes;
 *  - any request carrying a token older than half its TTL gets a fresh
 *    re-sign (see renewTokenIfStale), so active users never hit a wall
 *    and an idle session dies 30 minutes after its last activity.
 */

export const SESSION_COOKIE = 'auth-token';
export const SESSION_TTL_SECONDS = 60 * 30; // 30 minutes
export const SLIDE_AFTER_SECONDS = 60 * 15; // renew once the token is half its age

const key = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
);

/** JWT payload. `role` is in the token so the edge middleware can gate
 *  /admin without touching the DB; the DB re-check in getSessionUser()
 *  stays authoritative (demotions/disables apply immediately). */
export interface SessionPayload {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
}

/** Cookie attributes shared by set and clear so deletion always matches. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
}

function isSessionPayload(p: unknown): p is Partial<SessionPayload> {
  const o = p as Partial<SessionPayload>;
  return (
    typeof o?.id === 'number' &&
    typeof o.email === 'string' &&
    typeof o.name === 'string' &&
    (o.role === 'user' || o.role === 'admin')
  );
}

function sign(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS / 60}m`)
    .sign(key);
}

export async function createToken(payload: SessionPayload) {
  return sign(payload);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, key);
    return isSessionPayload(payload) ? (payload as SessionPayload) : null;
  } catch {
    return null;
  }
}

/**
 * Sliding expiration: verify a token and, once it is older than half its
 * TTL, re-sign it with a fresh full lifetime (same claims, new `iat`).
 * Returns null when the token is still fresh or invalid — the caller
 * keeps using what it has.
 */
export async function renewTokenIfStale(token: string): Promise<string | null> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, key));
  } catch {
    return null;
  }

  const iat = typeof payload.iat === 'number' ? payload.iat : 0;
  const ageSeconds = Math.floor(Date.now() / 1000) - iat;
  if (ageSeconds < SLIDE_AFTER_SECONDS) return null;
  if (!isSessionPayload(payload)) return null;

  // Drop the stale `iat`/`exp` so setIssuedAt()/setExpirationTime() stamp fresh ones.
  const claims: Record<string, unknown> = {};
  for (const [claim, value] of Object.entries(payload)) {
    if (claim !== 'iat' && claim !== 'exp') claims[claim] = value;
  }
  return sign(claims as unknown as SessionPayload);
}
