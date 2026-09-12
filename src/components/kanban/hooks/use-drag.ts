import { useCallback, useRef } from 'react';
import type { DragEvent } from 'react';

/**
 * Shared mutable drag state.
 *
 * Stored as a module-level object (not a plain let) so every CardList
 * instance reads/writes the same properties via a stable reference.
 * Using .refValue / Set avoids the module re-execution problem of a
 * bare let during hot reload.
 */
const dragState = {
  cardId: null as number | null,
  highlighted: new Set<HTMLElement>(),
};

function clearHighlights(): void {
  for (const el of dragState.highlighted) el.classList.remove('drag-over');
  dragState.highlighted.clear();
}

/**
 * Compute the insertion index from where the pointer was released.
 *
 * Iterates the direct card children of the drop container and compares
 * the pointer's Y coordinate to each card's vertical midpoint. The
 * dragged card is skipped because the backend expects a position *among
 * the other cards*.
 */
function dropPosition(container: HTMLElement, pointerY: number, draggedId: number): number {
  let position = 0;
  for (const child of container.children) {
    if (!(child instanceof HTMLElement) || child.dataset.cardId === undefined) continue;
    if (child.dataset.cardId === String(draggedId)) continue;
    const rect = child.getBoundingClientRect();
    if (pointerY < rect.top + rect.height / 2) break;
    position += 1;
  }
  return position;
}

export function useDrag(
  isAgent: boolean,
  moveCard: (cardId: number, targetListId: number, position: number) => Promise<void>,
  onError: (msg: string) => void
) {
  // Ref to track whether we're the instance that started a drag.
  // Only the instance whose card fired dragStart should clear the
  // shared state on dragEnd (otherwise every list instance races).
  const localDragOwner = useRef(false);

  const onDragStart = useCallback(
    (cardId: number) => (event: DragEvent<HTMLDivElement>) => {
      if (isAgent) return;
      dragState.cardId = cardId;
      localDragOwner.current = true;
      event.currentTarget.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(cardId));
    },
    [isAgent]
  );

  const onDragEnd = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!localDragOwner.current) return;
    localDragOwner.current = false;
    event.currentTarget.classList.remove('dragging');
    dragState.cardId = null;
    clearHighlights();
  }, []);

  /**
   * Marks .list-cards as a valid drop target.
   *
   * Must be on the container (not on each card) so it fires for both
   * the card area AND the gaps/padding between cards.
   */
  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const target = event.currentTarget;
    target.classList.add('drag-over');
    dragState.highlighted.add(target);
  }, []);

  /**
   * Handles the actual drop — reads the shared state, computes position,
   * and calls moveCard.
   */
  const onDrop = useCallback(
    (targetListId: number) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget;

      target.classList.remove('drag-over');
      dragState.highlighted.delete(target);

      const cardId = dragState.cardId;
      if (cardId === null) return;

      // Grab the pointer Y before clearing shared state
      const pointerY = event.clientY;

      dragState.cardId = null;

      moveCard(cardId, targetListId, dropPosition(target, pointerY, cardId)).catch((err) =>
        onError('Move failed: ' + (err as Error).message)
      );
    },
    [moveCard, onError]
  );

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) return;
    event.stopPropagation();
    const target = event.currentTarget;
    target.classList.remove('drag-over');
    dragState.highlighted.delete(target);
  }, []);

  return { onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop };
}

/**
 * Per-card onDragOver handler — prevents default on the card level so
 * the browser never considers the card an invalid drop zone, and lets
 * the event bubble to .list-cards where the container handler manages
 * the drop-target highlight.
 *
 * Without this, some browser engines (notably Chromium) may attempt to
 * nest/intercept drag over draggable child elements, preventing the
 * dragover from reaching .list-cards at all, which silently cancels
 * the entire drop.
 */
export function cardDragOver(event: DragEvent<HTMLDivElement>): void {
  event.preventDefault();
  // Do NOT stop propagation — .list-cards must also see this event to
  // add the drag-over highlight and remain the authoritative drop target.
}