import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import {
  cardJson,
  workSessionJson,
  startWorkSession,
  heartbeatWorkSession,
  getKanbanDb,
  getCardLabels,
  labelJson,
} from '@/lib/kanban';
import type { CardRow } from '@/lib/kanban';
import { corsHeaders, preflightResponse } from '@/lib/cors';
import { kanbanWorkSchema } from '@/lib/validations';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

/**
 * POST /api/kanban/cards/:id/work
 *
 * Without body: starts a new work session (first press or resume after pause).
 * With { duration: "HH:MM:SS" } (heartbeat): updates the active session's
 *   duration without ending it, and syncs actual_duration on the card.
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
      // No body — starting a session
    }

    if (body.duration) {
      // Validate duration format
      const validation = kanbanWorkSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid duration format, expected HH:MM:SS' },
          { status: 400, headers: corsHeaders(request) }
        );
      }

      // Heartbeat — update active session duration
      const session = heartbeatWorkSession(user.username, cardId, validation.data.duration!);
      if (!session) {
        return NextResponse.json(
          { error: 'No active work session' },
          { status: 404, headers: corsHeaders(request) }
        );
      }

      // Return updated card too so the frontend has fresh actual_duration
      const db = getKanbanDb(user.username);
      const card = db
        .prepare(
          `SELECT id, list_id, title, description, position, created_at, updated_at,
                  start_time, end_time, estimated_duration, actual_duration, completed,
                  assignee
           FROM kanban_cards WHERE id = ?`
        )
        .get(cardId) as unknown as CardRow;

      const labels = getCardLabels(user.username, cardId).map(labelJson);

      return NextResponse.json(
        {
          session: workSessionJson(session),
          card: cardJson(card, session.id, labels),
        },
        { status: 200, headers: corsHeaders(request) }
      );
    }

    // Start a new work session
    const session = startWorkSession(user.username, cardId);
    if (!session) {
      return NextResponse.json(
        { error: 'Card not found or work session already active' },
        { status: 409, headers: corsHeaders(request) }
      );
    }

    return NextResponse.json(
      { session: { id: session.id } },
      { status: 200, headers: corsHeaders(request) }
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}