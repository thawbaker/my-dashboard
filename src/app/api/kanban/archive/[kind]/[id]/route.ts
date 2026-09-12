import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { restoreArchived, permanentlyDeleteArchived } from '@/lib/kanban';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ kind: string; id: string }> };

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
    }

    const { kind, id } = await context.params;
    if (!['card', 'list'].includes(kind)) {
      return NextResponse.json({ error: 'Invalid kind — must be "card" or "list"' }, { status: 400, headers: corsHeaders(request) });
    }

    const itemId = Number(id);
    if (!Number.isInteger(itemId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400, headers: corsHeaders(request) });
    }

    const ok = restoreArchived(user.username, itemId, kind as 'card' | 'list');
    if (!ok) {
      return NextResponse.json({ error: 'Item not found or not archived' }, { status: 404, headers: corsHeaders(request) });
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders(request) });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
    }

    const { kind, id } = await context.params;
    if (!['card', 'list'].includes(kind)) {
      return NextResponse.json({ error: 'Invalid kind — must be "card" or "list"' }, { status: 400, headers: corsHeaders(request) });
    }

    const itemId = Number(id);
    if (!Number.isInteger(itemId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400, headers: corsHeaders(request) });
    }

    const ok = permanentlyDeleteArchived(user.username, itemId, kind as 'card' | 'list');
    if (!ok) {
      return NextResponse.json({ error: 'Item not found or not archived' }, { status: 404, headers: corsHeaders(request) });
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders(request) });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders(request) });
  }
}