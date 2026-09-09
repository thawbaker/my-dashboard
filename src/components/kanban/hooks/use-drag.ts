import { useCallback, useRef } from 'react';
import type { DragEvent } from 'react';

export function useDrag(
  isAgent: boolean,
  moveCard: (cardId: number, targetListId: number, position: number) => Promise<void>,
  onError: (msg: string) => void
) {
  const dragCardId = useRef<number | null>(null);

  const onDragStart = useCallback(
    (cardId: number) => (event: DragEvent<HTMLDivElement>) => {
      if (isAgent) return;
      dragCardId.current = cardId;
      event.currentTarget.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
    },
    [isAgent]
  );

  const onDragEnd = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.currentTarget.classList.remove('dragging');
    dragCardId.current = null;
  }, []);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (targetListId: number, cardCount: number) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (dragCardId.current === null) return;
      moveCard(dragCardId.current, targetListId, cardCount).catch((err) =>
        onError('Move failed: ' + (err as Error).message)
      );
    },
    [moveCard, onError]
  );

  return { onDragStart, onDragEnd, onDragOver, onDrop };
}
