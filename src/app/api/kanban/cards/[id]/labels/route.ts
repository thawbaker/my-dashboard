import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { addLabel, labelJson } from '@/lib/kanban';
import { corsHeaders, preflightResponse } from '@/lib/cors';
import { kanbanAddLabelSchema } from '@/lib/validations';

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

    const body = await request.json();
    const result = kanbanAddLabelSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          errors: result.error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const label = addLabel(user.username, cardId, result.data.name, result.data.color);
    if (!label) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404, headers: corsHeaders(request) });
    }

    return NextResponse.json({ label: labelJson(label) }, { status: 201, headers: corsHeaders(request) });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders(request) });
  }
}