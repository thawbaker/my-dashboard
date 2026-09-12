import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { removeLabel } from '@/lib/kanban';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string; labelId: string }> };

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
    }

    const { labelId } = await context.params;
    const lid = Number(labelId);
    if (!Number.isInteger(lid)) {
      return NextResponse.json({ error: 'Invalid label id' }, { status: 400, headers: corsHeaders(request) });
    }

    const ok = removeLabel(user.username, lid);
    if (!ok) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404, headers: corsHeaders(request) });
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders(request) });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders(request) });
  }
}