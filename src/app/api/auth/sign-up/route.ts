import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, createToken, setSession } from '@/lib/auth';
import { createUser, getUserByEmail, getUserByUsername } from '@/lib/db';
import { ensureUserDb } from '@/lib/user-db';
import { signUpSchema } from '@/lib/validations';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const result = signUpSchema.safeParse(body);
    if (!result.success) {
      const errors = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return NextResponse.json(
        { error: 'Invalid input', errors },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const { email, password, name, username } = result.data;

    // Check if user already exists
    const existingUser = getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 409, headers: corsHeaders(request) }
      );
    }

    // Username is unique and becomes the per-user DB filename (user-data/<username>.db)
    const existingUsername = getUserByUsername(username);
    if (existingUsername) {
      return NextResponse.json(
        { error: 'Username already taken', errorType: 'username_taken' },
        { status: 409, headers: corsHeaders(request) }
      );
    }

    // Public sign-up is always role=user. Denylist model: no permission
    // rows needed — new users get access to every enabled app by default.
    const hashedPassword = await hashPassword(password);
    const user = createUser({
      email,
      username,
      passwordHash: hashedPassword,
      name,
      role: 'user',
    });

    // Create the user's own SQLite DB (user-data/<username>.db) now that the
    // account exists — dashboard apps use it. Best-effort.
    ensureUserDb(user.username);

    // Create JWT token (30-min sliding TTL, see src/lib/token.ts)
    const token = await createToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const response = NextResponse.json(
      {
        message: 'User created successfully',
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
      { status: 201, headers: corsHeaders(request) }
    );

    // Set session cookie on the response (cookies() is read-only in route handlers)
    setSession(response, token);

    return response;
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}
