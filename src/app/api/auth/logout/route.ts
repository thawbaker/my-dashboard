import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { clearSession } from '@/lib/auth';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function POST(request: NextRequest) {
  // clearSession() must run on the outgoing response: in Next.js 15 route
  // handlers cookies() is read-only, so the old cookies().delete() call
  // never reached the browser and the session survived "logout".
  const response = NextResponse.json(
    { message: 'Logged out successfully' },
    { status: 200, headers: corsHeaders(request) }
  );
  clearSession(response);

  return response;
}
