import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifyToken,
  renewTokenIfStale,
  sessionCookieOptions,
} from '@/lib/token';

// Edge runtime: jose only — no DB, no bcrypt. This gate is a fast
// pre-filter; the authoritative check (including the disable check)
// happens in API routes via getSessionUser() and page data via /api/auth/me.

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifyToken(token) : null;

  // /admin* — valid token AND admin role (from JWT, see note above)
  if (pathname.startsWith('/admin')) {
    if (!payload || payload.role !== 'admin') {
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }
    return NextResponse.next();
  }

  // /dashboard* and /kanban* — valid token
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/kanban')) {
    if (!payload) {
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }
    return NextResponse.next();
  }

  // Auth pages — send already-authenticated users to the dashboard
  if (pathname === '/sign-in' || pathname === '/sign-up') {
    if (payload) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Sliding 30-minute expiration: any request (page or API) carrying a
  // token older than half its TTL gets a fresh re-sign, so active users
  // never hit a wall while an idle session dies 30 min after its last
  // activity. No-op (plain next()) while the token is still fresh.
  if (token) {
    const renewed = await renewTokenIfStale(token);
    if (renewed) {
      const response = NextResponse.next();
      response.cookies.set(SESSION_COOKIE, renewed, {
        ...sessionCookieOptions(),
        maxAge: SESSION_TTL_SECONDS,
      });
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/kanban/:path*',
    '/admin/:path*',
    '/sign-in',
    '/sign-up',
    '/api/:path*',
  ],
};
