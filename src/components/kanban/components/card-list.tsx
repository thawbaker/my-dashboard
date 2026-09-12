import { useCallback } from 'react';
import { useBoard } from '../context';
import { useDrag, cardDragOver } from '../hooks/use-drag';
import type { KanbanList } from '../types';
import { Card } from './card';

interface CardListProps {
  list: KanbanList;
}

export function CardList({ list }: CardListProps) {
  const { isAgent, moveCard, setError } = useBoard();
  const { onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop } = useDrag(isAgent, moveCard, setError);

  // Stable drop handler for this list — avoids creating a new closure on every render
  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => onDrop(list.id)(event),
    [onDrop, list.id]
  );

  return (
    <div
      className="list-cards"
      data-list-id={list.id}
      onDragOver={isAgent ? undefined : onDragOver}
      onDragLeave={isAgent ? undefined : onDragLeave}
      onDrop={isAgent ? undefined : handleDrop}
    >
      {list.cards.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', padding: '8px', textAlign: 'center' }}>
          No cards yet
        </div>
      ) : (
        list.cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            listId={list.id}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onCardDragOver={cardDragOver}
          />
        ))
      )}
    </div>
  );
}
