import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { buildReport, formatReportMarkdown, writeReportFile } from '@/lib/report';
import { kanbanReportSchema } from '@/lib/validations';
import { corsHeaders, preflightResponse } from '@/lib/cors';

export const runtime = 'nodejs';

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders(request) }
      );
    }

    const body = await request.json();
    const result = kanbanReportSchema.safeParse(body);
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

    const { startDate, endDate } = result.data;

    // Build the report
    const report = buildReport(user.username, { startDate, endDate });
    const markdown = formatReportMarkdown(report);
    const filepath = writeReportFile(user.username, markdown);

    return NextResponse.json(
      {
        success: true,
        filepath,
        filename: filepath.split('/').pop() ?? 'report.md',
        rows: report.rows.length,
        totalTime: report.totalTime,
      },
      { status: 200, headers: corsHeaders(request) }
    );
  } catch (err) {
    console.error('Report generation failed:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}