import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { clearSession } from '@/lib/auth';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function POST(request: NextRequest) {
  await clearSession();

  return NextResponse.json(
    { message: 'Logged out successfully' },
    { status: 200, headers: corsHeaders(request) }
  );
}
