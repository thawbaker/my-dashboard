import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getArchivedItems, labelJson, getCardLabels } from '@/lib/kanban';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
    }

    const { lists, cards } = getArchivedItems(user.username);

    return NextResponse.json(
      {
        lists: lists.map((l) => ({
          id: l.id,
          title: l.title,
          archivedAt: l.archived_at,
          cardCount: l.cardCount,
          createdAt: l.created_at,
        })),
        cards: cards.map((c) => ({
          id: c.id,
          listId: c.list_id,
          title: c.title,
          description: c.description,
          archivedAt: c.archived_at,
          listTitle: c.listTitle,
          assignee: c.assignee ?? null,
          labels: getCardLabels(user.username, c.id).map(labelJson),
        })),
      },
      { status: 200, headers: corsHeaders(request) }
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders(request) });
  }
}