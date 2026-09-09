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
      event.dataTransfer.setData('text/plain', String(cardId));
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
    const target = event.currentTarget;
    target.classList.add('drag-over');
  }, []);

  const onDrop = useCallback(
    (targetListId: number, cardCount: number) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.classList.remove('drag-over');
      if (dragCardId.current === null) return;
      moveCard(dragCardId.current, targetListId, cardCount).catch((err) =>
        onError('Move failed: ' + (err as Error).message)
      );
    },
    [moveCard, onError]
  );

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.currentTarget.classList.remove('drag-over');
  }, []);

  return { onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop };
}
