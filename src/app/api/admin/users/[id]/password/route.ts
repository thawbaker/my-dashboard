import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, hashPassword } from '@/lib/auth';
import { getUserById, setUserPassword } from '@/lib/db';
import { setUserPasswordSchema } from '@/lib/validations';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

/**
 * Admin sets a user's password to a specified value (same policy as
 * sign-up: min 6 chars, uppercase, special character). Works for any user,
 * including the admin's own account — there is no self-service
 * password-change flow, so this endpoint covers it. Existing live sessions
 * are kept (the JWT is id-based); the new password takes effect at sign-in.
 */
export async function POST(request: NextRequest, context: RouteContext) {
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
    const result = setUserPasswordSchema.safeParse(body);
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

    const target = getUserById(targetId);
    if (!target) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    setUserPassword(targetId, await hashPassword(result.data.password));

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
