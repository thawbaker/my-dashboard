import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { cardJson, getBoard, getCardLabels, labelJson, listJson } from '@/lib/kanban';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders(request) }
      );
    }

    const board = getBoard(user.username);
    const lists = board.map((list) => ({
      ...listJson(list),
      cards: list.cards.map((card) =>
        cardJson(card, null, getCardLabels(user.username, card.id).map(labelJson))
      ),
    }));

    return NextResponse.json({ lists }, { status: 200, headers: corsHeaders(request) });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}
