import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { countActiveAdmins, getAccessibleApps, getUserById, setUserDisabled } from '@/lib/db';
import { toggleDisabledSchema } from '@/lib/validations';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.error;

    const { id } = await context.params;
    const targetId = Number(id);
    if (!Number.isInteger(targetId)) {
      return NextResponse.json(
        { error: 'Invalid user id' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const body = await request.json();
    const result = toggleDisabledSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid input' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const target = getUserById(targetId);
    if (!target) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    // Guard: an admin cannot disable their own account
    if (targetId === admin.user.id && result.data.disabled) {
      return NextResponse.json(
        { error: 'You cannot disable your own account' },
        { status: 409, headers: corsHeaders(request) }
      );
    }

    // Guard: the last active admin cannot be disabled
    if (
      result.data.disabled &&
      target.role === 'admin' &&
      target.disabled === 0 &&
      countActiveAdmins() <= 1
    ) {
      return NextResponse.json(
        { error: 'Cannot disable the last active admin' },
        { status: 409, headers: corsHeaders(request) }
      );
    }

    setUserDisabled(targetId, result.data.disabled);
    const updated = getUserById(targetId)!;

    return NextResponse.json(
      {
        user: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          role: updated.role,
          disabled: updated.disabled === 1,
          createdAt: updated.created_at,
          appCount: getAccessibleApps(updated.id).length,
        },
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
