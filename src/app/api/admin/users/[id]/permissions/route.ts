import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getUserById, listApps, setBlockedAppIds } from '@/lib/db';
import { permissionsSchema } from '@/lib/validations';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function PUT(request: NextRequest, context: RouteContext) {
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
    const result = permissionsSchema.safeParse(body);
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

    // Ignore ids that don't reference a real app
    const allApps = listApps();
    const existingAppIds = new Set(allApps.map((app) => app.id));
    let blockedAppIds = result.data.blockedAppIds.filter((appId) =>
      existingAppIds.has(appId)
    );

    // Normalize against role semantics so the stored state matches the
    // effective access:
    //  - admins bypass the denylist entirely → nothing to store for them;
    //  - admin-only apps are already denied to users by role → dead rows
    //    (a stale row would also re-hide the app if it is later un-flagged).
    if (target.role === 'admin') {
      blockedAppIds = [];
    } else {
      const adminOnlyIds = new Set(
        allApps.filter((app) => app.admin_only === 1).map((app) => app.id)
      );
      blockedAppIds = blockedAppIds.filter((id) => !adminOnlyIds.has(id));
    }

    setBlockedAppIds(targetId, blockedAppIds);

    return NextResponse.json(
      { blockedAppIds },
      { status: 200, headers: corsHeaders(request) }
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}
