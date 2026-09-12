import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { archiveList } from '@/lib/kanban';
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
    const listId = Number(id);
    if (!Number.isInteger(listId)) {
      return NextResponse.json({ error: 'Invalid list id' }, { status: 400, headers: corsHeaders(request) });
    }

    const ok = archiveList(user.username, listId);
    if (!ok) {
      return NextResponse.json({ error: 'List not found or already archived' }, { status: 404, headers: corsHeaders(request) });
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders(request) });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders(request) });
  }
}