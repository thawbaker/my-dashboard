import { NextRequest, NextResponse } from 'next/server';
import { comparePasswords, createToken, setSession } from '@/lib/auth';
import { getUserByEmail } from '@/lib/db';
import { signInSchema } from '@/lib/validations';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const result = signInSchema.safeParse(body);
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

    const { email, password } = result.data;

    // Find user
    const user = getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        {
          error: 'No account found with this email address',
          errorType: 'email_not_found',
        },
        { status: 401, headers: corsHeaders(request) }
      );
    }

    // Disabled accounts are rejected before the password check
    if (user.disabled === 1) {
      return NextResponse.json(
        { error: 'Account is disabled', errorType: 'disabled' },
        { status: 403, headers: corsHeaders(request) }
      );
    }

    // Verify password
    const isValidPassword = await comparePasswords(password, user.password_hash);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Incorrect password', errorType: 'invalid_password' },
        { status: 401, headers: corsHeaders(request) }
      );
    }

    // Create JWT token
    const token = await createToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    // Set session cookie
    await setSession(token);

    return NextResponse.json(
      {
        message: 'Sign in successful',
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
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
