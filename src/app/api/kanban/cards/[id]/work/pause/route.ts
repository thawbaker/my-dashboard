import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { cardJson, workSessionJson, pauseWorkSession, getKanbanDb } from '@/lib/kanban';
import type { CardRow } from '@/lib/kanban';
import { corsHeaders, preflightResponse } from '@/lib/cors';
import { kanbanWorkSchema } from '@/lib/validations';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

/**
 * POST /api/kanban/cards/:id/work/pause
 *
 * Pauses the active work session. Optionally accepts { duration: "HH:MM:SS" }
 * to override auto-calculated duration (e.g. from a client-side timer).
 * Returns the closed session and updated card.
 */
export async function POST(request: NextRequest, context: RouteContext) {
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

    let body: { duration?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body — server will auto-calculate duration
    }

    if (body.duration) {
      const validation = kanbanWorkSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid duration format, expected HH:MM:SS' },
          { status: 400, headers: corsHeaders(request) }
        );
      }
    }

    const session = pauseWorkSession(user.username, cardId, body.duration);
    if (!session) {
      return NextResponse.json(
        { error: 'No active work session' },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    const db = getKanbanDb(user.username);
    const card = db
      .prepare(
        `SELECT id, list_id, title, description, position, created_at, updated_at,
                start_time, end_time, estimated_duration, actual_duration, completed
         FROM kanban_cards WHERE id = ?`
      )
      .get(cardId) as unknown as CardRow;

    return NextResponse.json(
      {
        session: workSessionJson(session),
        card: cardJson(card),
      },
      { status: 200, headers: corsHeaders(request) }
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}