import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import {
  countActiveAdmins,
  getAccessibleApps,
  getBlockedAppIds,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  updateUser,
  deleteUser,
} from '@/lib/db';
import { updateUserSchema } from '@/lib/validations';
import { deleteUserDb, renameUserDb } from '@/lib/user-db';
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
    const result = updateUserSchema.safeParse(body);
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
    const { name, username, email, role, disabled } = result.data;

    const target = getUserById(targetId);
    if (!target) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    // Guard: an admin cannot disable or demote their own account
    if (targetId === admin.user.id) {
      if (disabled === true) {
        return NextResponse.json(
          { error: 'You cannot disable your own account' },
          { status: 409, headers: corsHeaders(request) }
        );
      }
      if (role === 'user') {
        return NextResponse.json(
          { error: 'You cannot demote your own account' },
          { status: 409, headers: corsHeaders(request) }
        );
      }
    }

    const targetIsLastActiveAdmin =
      target.role === 'admin' && target.disabled === 0 && countActiveAdmins() <= 1;
    if (targetIsLastActiveAdmin) {
      if (disabled === true) {
        return NextResponse.json(
          { error: 'Cannot disable the last active admin' },
          { status: 409, headers: corsHeaders(request) }
        );
      }
      if (role === 'user') {
        return NextResponse.json(
          { error: 'Cannot demote the last active admin' },
          { status: 409, headers: corsHeaders(request) }
        );
      }
    }

    // Uniqueness: only check when the field actually changes
    if (username !== undefined && username !== target.username) {
      if (getUserByUsername(username)) {
        return NextResponse.json(
          { error: 'Username already taken', errorType: 'username_taken' },
          { status: 409, headers: corsHeaders(request) }
        );
      }
    }
    if (email !== undefined && email !== target.email) {
      if (getUserByEmail(email)) {
        return NextResponse.json(
          { error: 'Email already in use', errorType: 'email_taken' },
          { status: 409, headers: corsHeaders(request) }
        );
      }
    }

    updateUser(targetId, { name, username, email, role, disabled });

    // Renaming the username moves the user's personal data file
    // (user-data/<username>.db) so their apps keep working.
    if (username !== undefined && username !== target.username) {
      renameUserDb(target.username, username);
    }

    const updated = getUserById(targetId)!;

    return NextResponse.json(
      {
        user: {
          id: updated.id,
          email: updated.email,
          username: updated.username,
          name: updated.name,
          role: updated.role,
          disabled: updated.disabled === 1,
          createdAt: updated.created_at,
          appCount: getAccessibleApps(updated).length,
          blockedAppIds: getBlockedAppIds(updated.id),
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

export async function DELETE(request: NextRequest, context: RouteContext) {
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

    const target = getUserById(targetId);
    if (!target) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    // Guard: an admin cannot delete their own account
    if (targetId === admin.user.id) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
        { status: 409, headers: corsHeaders(request) }
      );
    }

    // Guard: the last active admin cannot be deleted
    if (
      target.role === 'admin' &&
      target.disabled === 0 &&
      countActiveAdmins() <= 1
    ) {
      return NextResponse.json(
        { error: 'Cannot delete the last active admin' },
        { status: 409, headers: corsHeaders(request) }
      );
    }

    // Permission rows cascade; the per-user DB file is removed best-effort.
    // Live sessions die immediately (every request re-checks the DB).
    deleteUser(targetId);
    deleteUserDb(target.username);

    return NextResponse.json(
      { success: true },
      { status: 200, headers: corsHeaders(request) }
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}
