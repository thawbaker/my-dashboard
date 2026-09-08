import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import {
  getAccessibleApps,
  getBlockedAppIds,
  getUserByEmail,
  getUserByUsername,
  listUsers,
} from '@/lib/db';
import { signUpAdminUserSchema } from '@/lib/validations';
import { corsHeaders, preflightResponse } from '@/lib/cors';
import { hashPassword } from '@/lib/auth';
import { createUser } from '@/lib/db';

export const runtime = 'nodejs';

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.error;

  const users = listUsers().map((u) => ({
    id: u.id,
    email: u.email,
    username: u.username,
    name: u.name,
    role: u.role,
    disabled: u.disabled === 1,
    createdAt: u.created_at,
    appCount: getAccessibleApps(u).length,
    blockedAppIds: getBlockedAppIds(u.id),
  }));

  return NextResponse.json({ users }, { status: 200, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.error;

    const body = await request.json();
    const result = signUpAdminUserSchema.safeParse(body);
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

    const { email, password, name, role, username } = result.data;

    if (getUserByEmail(email)) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 409, headers: corsHeaders(request) }
      );
    }

    if (getUserByUsername(username)) {
      return NextResponse.json(
        { error: 'Username already taken', errorType: 'username_taken' },
        { status: 409, headers: corsHeaders(request) }
      );
    }

    const user = createUser({
      email,
      username,
      passwordHash: await hashPassword(password),
      name,
      role,
    });

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
          role: user.role,
          disabled: user.disabled === 1,
          createdAt: user.created_at,
          appCount: getAccessibleApps(user).length,
        },
      },
      { status: 201, headers: corsHeaders(request) }
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}
