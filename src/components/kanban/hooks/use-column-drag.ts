import { useCallback, useRef } from 'react';

/**
 * Hook for drag-and-drop column (list) reorder.
 * The column headers are the drag handles; the board container is the drop zone.
 *
 * When a column header is dragged and dropped between columns, the new order
 * is computed and returned to the caller via onReorder.
 */
export function useColumnDrag(
  onReorder: (orderedIds: number[]) => Promise<void>,
  onError: (msg: string) => void
) {
  // The id of the list currently being dragged
  const dragListIdRef = useRef<number | null>(null);
  const highlightedTargetsRef = useRef<Set<HTMLElement>>(new Set());

  const clearHighlights = useCallback(() => {
    for (const el of highlightedTargetsRef.current) el.classList.remove('drag-over');
    highlightedTargetsRef.current.clear();
  }, []);

  /** Called on the column header (drag handle). */
  const onHeaderDragStart = useCallback(
    (listId: number) => (event: React.DragEvent<HTMLElement>) => {
      dragListIdRef.current = listId;
      event.currentTarget.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(listId));
    },
    []
  );

  const onHeaderDragEnd = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.currentTarget.classList.remove('dragging');
      dragListIdRef.current = null;
      clearHighlights();
    },
    [clearHighlights]
  );

  /** Called on the board (drop zone container). */
  const onBoardDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const target = event.currentTarget;
    target.classList.add('drag-over');
    highlightedTargetsRef.current.add(target);
  }, []);

  const onBoardDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) return;
    const target = event.currentTarget;
    target.classList.remove('drag-over');
    highlightedTargetsRef.current.delete(target);
  }, []);

  const onBoardDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      target.classList.remove('drag-over');
      highlightedTargetsRef.current.delete(target);

      const draggedId = dragListIdRef.current;
      dragListIdRef.current = null;
      clearHighlights();
      if (draggedId === null) return;

      // Compute new order: find where the pointer is among the list elements
      const pointerX = event.clientX;
      const boardEl = event.currentTarget;
      const listEls = Array.from(boardEl.children).filter(
        (child) => child instanceof HTMLElement && child.dataset.listId !== undefined
      ) as HTMLElement[];

      const ids = listEls.map((el) => Number(el.dataset.listId));
      const currentIndex = ids.indexOf(draggedId);
      if (currentIndex === -1) return;

      // Find insertion position
      let insertIndex = ids.length - 1;
      for (let i = 0; i < listEls.length; i++) {
        if (Number(listEls[i].dataset.listId) === draggedId) continue;
        const rect = listEls[i].getBoundingClientRect();
        if (pointerX < rect.left + rect.width / 2) {
          insertIndex = i;
          break;
        }
        // Count non-dragged elements before this point
      }

      // Adjust insertion index for the dragged element
      const realIndex = insertIndex > currentIndex ? insertIndex - 1 : insertIndex;
      const without = ids.filter((id) => id !== draggedId);
      const newOrder = [...without.slice(0, realIndex), draggedId, ...without.slice(realIndex)];

      onReorder(newOrder).catch((err) => onError('Reorder failed: ' + (err as Error).message));
    },
    [onReorder, onError, clearHighlights]
  );

  return { onHeaderDragStart, onHeaderDragEnd, onBoardDragOver, onBoardDragLeave, onBoardDrop };
}