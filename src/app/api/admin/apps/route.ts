import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createApp, listApps } from '@/lib/db';
import { appSchema } from '@/lib/validations';
import { slugify } from '@/lib/utils';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

function appJson(app: {
  id: number;
  name: string;
  slug: string;
  icon: string;
  url: string;
  enabled: 0 | 1;
  created_at: string;
}) {
  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    icon: app.icon,
    url: app.url,
    enabled: app.enabled === 1,
    createdAt: app.created_at,
  };
}

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.error;

  const apps = listApps().map(appJson);
  return NextResponse.json({ apps }, { status: 200, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.error;

    const body = await request.json();
    const result = appSchema.safeParse(body);
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

    const { name, url, icon } = result.data;
    const slug = slugify(name);
    if (!slug) {
      return NextResponse.json(
        { error: 'Name must produce a valid slug' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const existing = listApps().find((app) => app.slug === slug);
    if (existing) {
      return NextResponse.json(
        { error: 'An app with this name already exists' },
        { status: 409, headers: corsHeaders(request) }
      );
    }

    const app = createApp({ name, slug, icon, url });
    return NextResponse.json(
      { app: appJson(app) },
      { status: 201, headers: corsHeaders(request) }
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}
