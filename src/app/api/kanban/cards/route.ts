import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { cardJson, createCard } from '@/lib/kanban';
import { corsHeaders, preflightResponse } from '@/lib/cors';
import { kanbanCreateCardSchema } from '@/lib/validations';

export const runtime = 'nodejs';

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders(request) }
      );
    }

    const body = await request.json();
    const result = kanbanCreateCardSchema.safeParse(body);
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

    const card = createCard(
      user.username,
      result.data.listId,
      title,
      result.data.description?.trim() ?? ''
    );
    if (!card) {
      return NextResponse.json(
        { error: 'List not found' },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    return NextResponse.json(
      { card: cardJson(card) },
      { status: 201, headers: corsHeaders(request) }
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}
