import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { archiveCard } from '@/lib/kanban';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
    }

    const { id } = await context.params;
    const cardId = Number(id);
    if (!Number.isInteger(cardId)) {
      return NextResponse.json({ error: 'Invalid card id' }, { status: 400, headers: corsHeaders(request) });
    }

    const ok = archiveCard(user.username, cardId);
    if (!ok) {
      return NextResponse.json({ error: 'Card not found or already archived' }, { status: 404, headers: corsHeaders(request) });
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders(request) });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders(request) });
  }
}