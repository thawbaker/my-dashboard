import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { createList, listJson } from '@/lib/kanban';
import { corsHeaders, preflightResponse } from '@/lib/cors';
import { kanbanCreateListSchema } from '@/lib/validations';

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
    const result = kanbanCreateListSchema.safeParse(body);
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

    const list = createList(user.username, title);
    return NextResponse.json(
      { list: listJson(list) },
      { status: 201, headers: corsHeaders(request) }
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}
