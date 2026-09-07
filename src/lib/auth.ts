import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getUserById, type User } from '@/lib/db';
import { corsHeaders, type CorsRequest } from '@/lib/cors';

const key = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'
);

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function comparePasswords(password: string, hashedPassword: string) {
  return bcrypt.compare(password, hashedPassword);
}

/** JWT payload. `role` is in the token so the edge middleware can gate
 *  /admin without touching the DB; the DB re-check in getSessionUser()
 *  stays authoritative (demotions/disables apply immediately). */
export interface SessionPayload {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
}

export async function createToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(key);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, key);
    const p = payload as Partial<SessionPayload>;
    if (
      typeof p.id !== 'number' ||
      typeof p.email !== 'string' ||
      typeof p.name !== 'string' ||
      (p.role !== 'user' && p.role !== 'admin')
    ) {
      return null;
    }
    return p as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Current user, re-checked against the DB on every API request.
 * Returns null when: no token, invalid/expired token, user deleted, or
 * user disabled — the last case is what kills live sessions immediately.
 */
export async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token');
  if (!token) return null;

  const payload = await verifyToken(token.value);
  if (!payload) return null;

  const user = getUserById(payload.id);
  if (!user || user.disabled === 1) return null;
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

export async function setSession(token: string) {
  const cookieStore = await cookies();
  cookieStore.set('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete('auth-token');
}
