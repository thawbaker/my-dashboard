import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { cardJson, deleteCard, updateCard } from '@/lib/kanban';
import { corsHeaders, preflightResponse } from '@/lib/cors';
import { kanbanUpdateCardSchema } from '@/lib/validations';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders(request) }
      );
    }

    const { id } = await context.params;
    const cardId = Number(id);
    if (!Number.isInteger(cardId)) {
      return NextResponse.json(
        { error: 'Invalid card id' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const body = await request.json();
    const result = kanbanUpdateCardSchema.safeParse(body);
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

    const patch: { title?: string; description?: string } = {};
    if (result.data.title !== undefined) {
      const title = result.data.title.trim();
      if (!title) {
        return NextResponse.json(
          {
            error: 'Invalid input',
            errors: [{ field: 'title', message: 'Title is required' }],
          },
          { status: 400, headers: corsHeaders(request) }
        );
      }
      patch.title = title;
    }
    if (result.data.description !== undefined) {
      patch.description = result.data.description.trim();
    }

    const card = updateCard(user.username, cardId, patch);
    if (!card) {
      return NextResponse.json(
        { error: 'Card not found' },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    return NextResponse.json(
      { card: cardJson(card) },
      { status: 200, headers: corsHeaders(request) }
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders(request) }
      );
    }

    const { id } = await context.params;
    const cardId = Number(id);
    if (!Number.isInteger(cardId)) {
      return NextResponse.json(
        { error: 'Invalid card id' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const ok = deleteCard(user.username, cardId);
    if (!ok) {
      return NextResponse.json(
        { error: 'Card not found' },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders(request) });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}
