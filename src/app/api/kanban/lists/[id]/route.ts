import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { deleteList, listJson, renameList } from '@/lib/kanban';
import { corsHeaders, preflightResponse } from '@/lib/cors';
import { kanbanUpdateListSchema } from '@/lib/validations';

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
    const listId = Number(id);
    if (!Number.isInteger(listId)) {
      return NextResponse.json(
        { error: 'Invalid list id' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const body = await request.json();
    const result = kanbanUpdateListSchema.safeParse(body);
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

    const list = renameList(user.username, listId, title);
    if (!list) {
      return NextResponse.json(
        { error: 'List not found' },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    return NextResponse.json(
      { list: listJson(list) },
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
    const listId = Number(id);
    if (!Number.isInteger(listId)) {
      return NextResponse.json(
        { error: 'Invalid list id' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const ok = deleteList(user.username, listId);
    if (!ok) {
      return NextResponse.json(
        { error: 'List not found' },
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
