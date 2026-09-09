import { Suspense } from 'react';
import '@/components/kanban/kanban.css';
import { KanbanBoard } from '@/components/kanban/kanban-board';

export default function KanbanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <KanbanBoard />
    </Suspense>
  );
}
