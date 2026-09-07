import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export type CorsRequest = NextRequest;

/**
 * Same-origin by default (no CORS headers). When ALLOWED_ORIGINS
 * (comma-separated) is set, listed origins are echoed back with
 * credentials support so cookie auth works from those origins.
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export function corsHeaders(req: NextRequest): Record<string, string> {
  if (ALLOWED_ORIGINS.length === 0) return {};

  const origin = req.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      Vary: 'Origin',
    };
  }
  return { Vary: 'Origin' };
}

/** 204 response for CORS preflight (OPTIONS) requests. */
export function preflightResponse(req: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders(req),
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
