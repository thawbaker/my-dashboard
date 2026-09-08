import { LayoutGrid } from 'lucide-react';

/**
 * Brand header: teal gradient "My Dashboard" wordmark with an icon tile.
 * Shown above the sign-in form (and reusable elsewhere).
 */
export function AppHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-cyan-600 shadow-lg shadow-teal-500/30">
        <LayoutGrid className="h-7 w-7 text-white" />
      </span>
      <h1 className="bg-gradient-to-r from-teal-500 via-teal-500 to-cyan-500 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent dark:from-teal-300 dark:via-teal-400 dark:to-cyan-400">
        My Dashboard
      </h1>
      {subtitle && (
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      )}
      <span className="h-1 w-16 rounded-full bg-gradient-to-r from-teal-400 to-cyan-500" />
    </div>
  );
}
