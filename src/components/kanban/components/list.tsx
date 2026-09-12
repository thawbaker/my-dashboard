import type { DragEvent } from 'react';
import type { KanbanList } from '../types';
import { CardList } from './card-list';
import { ListFooter } from './list-footer';
import { ListHeader } from './list-header';

const LIST_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#ef4444'];

interface ListProps {
  list: KanbanList;
  index: number;
  onHeaderDragStart: (listId: number) => (event: DragEvent<HTMLElement>) => void;
  onHeaderDragEnd: (event: DragEvent<HTMLElement>) => void;
}

export function List({ list, index, onHeaderDragStart, onHeaderDragEnd }: ListProps) {
  const color = LIST_COLORS[index % LIST_COLORS.length];

  return (
    <div className="list" data-list-id={list.id} role="region" aria-label={`List: ${list.title}`}>
      <ListHeader list={list} color={color} onDragStart={onHeaderDragStart} onDragEnd={onHeaderDragEnd} />
      <CardList list={list} />
      <ListFooter list={list} />
    </div>
  );
}