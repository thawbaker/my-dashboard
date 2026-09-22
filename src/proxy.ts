/**
 * Next.js Proxy (replaces deprecated Edge Runtime middleware.ts).
 *
 * Auth-gates /admin/*, /dashboard/*, /kanban/*, /sign-in, /sign-up
 * before forwarding to the Next.js server. Uses jose-based JWT tokens
 * — no DB, no bcrypt, only a fast JWT pre-filter.
 *
 * Next.js calls this function for every request handled by the proxy.
 *
 * Docs: https://nextjs.org/docs/app/api-reference/next-config-js/proxy
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifyToken,
  renewTokenIfStale,
  sessionCookieOptions,
} from '@/lib/token';

/* ------------------------------------------------------------------ */
/*  Auth pre-filter                                                    */
/* ------------------------------------------------------------------ */

/**
 * Decide whether to allow the request, redirect, or set a renewed token.
 *
 * Returns one of:
 *   - `{ allow: true }` → forward to Next.js
 *   - `{ allow: false, redirect: <string> }` → send a redirect
 *   - `{ allow: true, renewedToken: <string> }` → forward + attach Set-Cookie
 */
async function authCheck(
  pathname: string,
  token: string | null,
): Promise<
  | { allow: true; renewedToken?: string }
  | { allow: false; redirect: string }
> {
  const payload = token ? await verifyToken(token) : null;

  // /admin* — valid token AND admin role
  if (pathname.startsWith('/admin')) {
    if (!payload || payload.role !== 'admin') {
      return { allow: false, redirect: '/sign-in' };
    }
  }

  // /dashboard*, /kanban* — valid token
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/kanban')) {
    if (!payload) {
      return { allow: false, redirect: '/sign-in' };
    }
  }

  // Auth pages — redirect authenticated users to dashboard
  if (pathname === '/sign-in' || pathname === '/sign-up') {
    if (payload) {
      return { allow: false, redirect: '/dashboard' };
    }
  }

  // API routes and everything else: pass through. The authoritative DB
  // check happens in the route handlers themselves.

  // Sliding 30-minute expiration: renew if token is half its age
  if (token) {
    const renewed = await renewTokenIfStale(token);
    if (renewed) {
      return { allow: true, renewedToken: renewed };
    }
  }

  return { allow: true };
}

/* ------------------------------------------------------------------ */
/*  Proxy handler — called by Next.js per request                      */
/* ------------------------------------------------------------------ */

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = new URL(request.url);
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? null;

  try {
    const auth = await authCheck(pathname, token);

    if (!auth.allow) {
      return NextResponse.redirect(new URL(auth.redirect, request.url));
    }

    // If the token was renewed, set the refreshed cookie on the response
    if (auth.renewedToken) {
      const response = NextResponse.next();
      response.cookies.set(SESSION_COOKIE, auth.renewedToken, {
        ...sessionCookieOptions(),
        maxAge: SESSION_TTL_SECONDS,
      });
      return response;
    }

    return NextResponse.next();
  } catch (err) {
    console.error('[proxy]', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}