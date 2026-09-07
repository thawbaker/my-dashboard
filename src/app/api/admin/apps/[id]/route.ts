import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getAppById, listApps, updateApp } from '@/lib/db';
import { updateAppSchema } from '@/lib/validations';
import { slugify } from '@/lib/utils';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

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

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.error;

    const { id } = await context.params;
    const targetId = Number(id);
    if (!Number.isInteger(targetId)) {
      return NextResponse.json(
        { error: 'Invalid app id' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const app = getAppById(targetId);
    if (!app) {
      return NextResponse.json(
        { error: 'App not found' },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    const body = await request.json();
    const result = updateAppSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid input' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const { name, url, icon, enabled } = result.data;
    if (name === undefined && url === undefined && icon === undefined && enabled === undefined) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const patch: { name?: string; slug?: string; url?: string; icon?: string; enabled?: boolean } = {};
    if (url !== undefined) patch.url = url;
    if (icon !== undefined) patch.icon = icon;
    if (enabled !== undefined) patch.enabled = enabled;

    // Renaming recomputes the slug; refuse collisions with other apps
    if (name !== undefined) {
      patch.name = name;
      const slug = slugify(name);
      if (!slug) {
        return NextResponse.json(
          { error: 'Name must produce a valid slug' },
          { status: 400, headers: corsHeaders(request) }
        );
      }
      const clash = listApps().find((a) => a.slug === slug && a.id !== targetId);
      if (clash) {
        return NextResponse.json(
          { error: 'An app with this name already exists' },
          { status: 409, headers: corsHeaders(request) }
        );
      }
      patch.slug = slug;
    }

    const updated = updateApp(targetId, patch)!;
    return NextResponse.json(
      { app: appJson(updated) },
      { status: 200, headers: corsHeaders(request) }
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}
