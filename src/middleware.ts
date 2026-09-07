import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Edge runtime: jose only — no DB, no bcrypt. This gate is a fast
// pre-filter; the authoritative check (including the disable check)
// happens in API routes via getSessionUser() and page data via /api/auth/me.
const key = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'
);

async function getPayload(token: string): Promise<{ role?: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key);
    return payload as { role?: string };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('auth-token')?.value;
  const payload = token ? await getPayload(token) : null;

  // /admin* — valid token AND admin role (from JWT, see note above)
  if (pathname.startsWith('/admin')) {
    if (!payload || payload.role !== 'admin') {
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }
    return NextResponse.next();
  }

  // /dashboard* — valid token
  if (pathname.startsWith('/dashboard')) {
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/sign-in', '/sign-up'],
};
