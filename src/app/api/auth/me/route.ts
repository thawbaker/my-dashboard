import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getAccessibleApps } from '@/lib/db';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function GET(request: NextRequest) {
  // getSessionUser re-checks the DB: deleted or disabled users get 401,
  // which kills live sessions and sends the client back to /sign-in.
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: corsHeaders(request) }
    );
  }

  return NextResponse.json(
    {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      // Role-aware: admins get every enabled app (incl. admin-only);
      // users get enabled, non-admin-only apps minus their denylist.
      apps: getAccessibleApps(user),
    },
    { status: 200, headers: corsHeaders(request) }
  );
}
