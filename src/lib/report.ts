import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getKanbanDb, hmsToSeconds, type CardRow, type WorkSessionRow, type ListRow } from '@/lib/kanban';
import { USER_DATA_DIR } from '@/lib/user-db';

/**
 * Format seconds as HH:MM (without seconds) for report display.
 */
function secondsToHmsShort(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Task/Time Report Generator
//
// Queries kanban_cards + work_sessions for all cards with time-tracked
// activity within a date range, orders by elapsed time (max → min), and
// writes a markdown report file to:
//   user-data/{username}/reports/ttime-{yymmdd}-{hhmm}.md
// ---------------------------------------------------------------------------

export interface ReportDateRange {
  /** ISO date string (YYYY-MM-DD), inclusive start */
  startDate: string;
  /** ISO date string (YYYY-MM-DD), inclusive end */
  endDate: string;
}

/** A single report row — elapsedTime is in HH:MM format. */
export interface ReportRow {
  task: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  elapsedTime: string;
  /** Elapsed time in seconds for sorting */
  elapsedSeconds: number;
}

/** Compiled report data before formatting. */
export interface ReportData {
  title: string;
  range: ReportDateRange;
  generatedAt: string;
  rows: ReportRow[];
  totalTime: string;
}

/**
 * Build a Task/Time report for the given user and date range.
 * Returns the structured report data (before formatting to markdown).
 */
export function buildReport(username: string, range: ReportDateRange): ReportData {
  const db = getKanbanDb(username);

  // Convert inclusive dates to SQL comparisons.
  // work_sessions.start_time / end_time are stored as 'YYYY-MM-DD HH:MM:SS'
  // so we compare against start of startDate and end of endDate.
  const start = `${range.startDate} 00:00:00`;
  const end = `${range.endDate} 23:59:59`;

  // Find all work sessions that overlap with the range.
  // A session is "in range" if any part of it falls within [start, end].
  const sessions = db
    .prepare(
      `SELECT ws.id, ws.card_id, ws.start_time, ws.end_time, ws.duration, ws.created_at
       FROM work_sessions ws
       WHERE ws.start_time <= ? AND (ws.end_time IS NULL OR ws.end_time >= ?)
       ORDER BY ws.card_id ASC, ws.start_time ASC`
    )
    .all(end, start) as unknown as WorkSessionRow[];

  // Group session durations by card, computing effective time per card
  const cardDurations = new Map<number, number>(); // cardId → total seconds in range

  for (const session of sessions) {
    // Clamp session time to the requested range
    const sessionStart = session.start_time < start ? start : session.start_time;
    const sessionEnd = !session.end_time || session.end_time > end ? end : session.end_time;

    // If the clamped range is valid, add the duration
    if (sessionStart < sessionEnd) {
      const diffSec = Math.floor(
        (new Date(sessionEnd.replace(' ', 'T') + 'Z').getTime() -
          new Date(sessionStart.replace(' ', 'T') + 'Z').getTime()) /
          1000
      );
      if (diffSec > 0) {
        cardDurations.set(session.card_id, (cardDurations.get(session.card_id) ?? 0) + diffSec);
      }
    }
  }

  // If a session is still active (end_time IS NULL), its duration up to the
  // range end is counted above by the clamping logic.
  // If a card has actual_duration but no sessions in the range, we still
  // include it if the card itself was active within the range (start_time/end_time).

  // Gather cards that had activity in the range — either via sessions or
  // via card-level time fields that intersect the range.
  const cardIdsFromSessions = new Set(cardDurations.keys());

  const cardsWithActivity = db
    .prepare(
      `SELECT c.id, c.list_id, c.title, c.description, c.start_time, c.end_time,
              c.actual_duration, c.estimated_duration, c.completed, c.assignee, c.archived_at
       FROM kanban_cards c
       WHERE (
         c.id IN (${cardIdsFromSessions.size > 0 ? [...cardIdsFromSessions].join(',') : '0'})
         OR
         (c.start_time IS NOT NULL AND c.start_time <= ? AND (c.end_time IS NULL OR c.end_time >= ?))
       )
       ORDER BY c.id ASC`
    )
    .all(end, start) as unknown as CardRow[];

  // Build rows, ordered by elapsed time descending
  const rows: ReportRow[] = cardsWithActivity
    .map((card) => {
      const elapsedSec = cardDurations.get(card.id) ?? hmsToSeconds(card.actual_duration);
      return {
        task: card.title,
        description: card.description ?? '',
        startDate: card.start_time ? card.start_time.slice(0, 10) : null,
        endDate: card.end_time ? card.end_time.slice(0, 10) : null,
        elapsedTime: secondsToHmsShort(elapsedSec),
        elapsedSeconds: elapsedSec,
      };
    })
    .sort((a, b) => b.elapsedSeconds - a.elapsedSeconds);

  const totalSeconds = rows.reduce((sum, r) => sum + r.elapsedSeconds, 0);

  const now = new Date();

  return {
    title: 'Task/Time Report',
    range,
    generatedAt: now.toISOString(),
    rows,
    totalTime: secondsToHmsShort(totalSeconds),
  };
}

/**
 * Format report data as a markdown string with word-wrapped descriptions.
 */
export function formatReportMarkdown(report: ReportData): string {
  const lines: string[] = [];

  // Title
  lines.push(`# ${report.title}`);
  lines.push('');

  // Date range
  lines.push(`**Date Range:** ${report.range.startDate} — ${report.range.endDate}`);
  lines.push('');

  // Table header — use padded column names so content doesn't wrap
  lines.push('| Task | Description | Start Date | End Date | Elapsed |');
  lines.push('|------|-------------|------------|----------|---------|');

  // Table rows — wrap description to fit ~40 chars per wrapped line
  for (const row of report.rows) {
    const wrapped = wordWrap(row.description, 40);
    const descCell = wrapped.length > 0 ? wrapped[0] : '';
    // If the description has more lines, they go in separate cells below
    // (handled by rowspan-like approach — we emit multiple table rows)

    // First data row
    lines.push(
      `| ${escapeMd(row.task)} | ${escapeMd(descCell)} | ${row.startDate ?? '—'} | ${row.endDate ?? '—'} | ${row.elapsedTime} |`
    );

    // Extra description lines
    for (let i = 1; i < wrapped.length; i++) {
      lines.push(`| | ${escapeMd(wrapped[i])} | | | |`);
    }
  }

  lines.push('');
  lines.push(`**Total Time:** ${report.totalTime}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Write a report markdown file to user-data/{username}/reports/.
 * Returns the full file path.
 */
export function writeReportFile(username: string, markdown: string): string {
  const reportsDir = path.join(USER_DATA_DIR, username, 'reports');
  mkdirSync(reportsDir, { recursive: true });

  const now = new Date();
  const yymmdd = String(now.getFullYear()).slice(2) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const hhmm = String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0');

  const filename = `ttime-${yymmdd}-${hhmm}.md`;
  const filepath = path.join(reportsDir, filename);

  writeFileSync(filepath, markdown, 'utf-8');
  return filepath;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Word-wrap text to a given max column width, returning an array of lines.
 * Preserves existing newlines.
 */
function wordWrap(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const para of paragraphs) {
    if (para.length === 0) {
      lines.push('');
      continue;
    }

    let current = '';
    const words = para.split(/\s+/);

    for (const word of words) {
      if (current.length + word.length + (current.length > 0 ? 1 : 0) > maxWidth) {
        if (current.length > 0) {
          lines.push(current);
          current = word;
        } else {
          // Word longer than maxWidth — force it in
          lines.push(word);
          current = '';
        }
      } else {
        current = current.length > 0 ? `${current} ${word}` : word;
      }
    }

    if (current.length > 0) lines.push(current);
  }

  return lines;
}

/**
 * Escape pipe and newline characters for markdown table cells.
 */
function escapeMd(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}