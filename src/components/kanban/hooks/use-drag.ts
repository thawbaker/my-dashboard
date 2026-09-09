import { useCallback } from 'react';
import type { DragEvent } from 'react';

/**
 * Id of the card currently being dragged.
 *
 * Deliberately NOT a useRef: useDrag() is instantiated once per list (see
 * CardList), and the drop target is always a *different* instance than the
 * drag source. Per-instance state would make cross-list drops read null and
 * turn into no-ops. A module-level variable is safe because exactly one
 * board (and therefore one drag) exists on the page at a time.
 */
let dragCardId: number | null = null;

/**
 * Drop-target elements currently showing the .drag-over highlight.
 *
 * Used by onDragEnd to clear every highlight when a drag ends without a
 * drop (cancelled via Esc, or released over a non-target area) — an
 * unmatched dragleave never fires in those cases.
 */
const highlightedTargets = new Set<HTMLElement>();

/** Remove the highlight from every element still carrying it (drag cancelled). */
function clearHighlights(): void {
  for (const el of highlightedTargets) el.classList.remove('drag-over');
  highlightedTargets.clear();
}

/**
 * Compute the insertion index from where the pointer is released: the
 * position of the first non-dragged card whose vertical midpoint sits below
 * the cursor. The dragged card (still in the DOM while dragging) is skipped
 * so the result matches the backend's "index among other cards" semantics.
 */
function dropPosition(event: DragEvent<HTMLDivElement>, draggedId: number): number {
  const pointerY = event.clientY;
  let position = 0;
  for (const child of Array.from(event.currentTarget.children)) {
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
  const onDragStart = useCallback(
    (cardId: number) => (event: DragEvent<HTMLDivElement>) => {
      if (isAgent) return;
      dragCardId = cardId;
      event.currentTarget.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(cardId));
    },
    [isAgent]
  );

  const onDragEnd = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.currentTarget.classList.remove('dragging');
    dragCardId = null;
    clearHighlights();
  }, []);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    // preventDefault() marks this element as a valid drop target — without
    // it the drop event never fires. Dragover fires continuously while the
    // pointer is above the list (bubbling from whichever card/whitespace is
    // underneath), so adding the class here (idempotently) is what lights
    // the whole list up.
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const target = event.currentTarget;
    target.classList.add('drag-over');
    highlightedTargets.add(target);
  }, []);

  const onDrop = useCallback(
    (targetListId: number) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      target.classList.remove('drag-over');
      highlightedTargets.delete(target);
      const cardId = dragCardId;
      dragCardId = null;
      if (cardId === null) return;
      moveCard(cardId, targetListId, dropPosition(event, cardId)).catch((err) =>
        onError('Move failed: ' + (err as Error).message)
      );
    },
    [moveCard, onError]
  );

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    // dragenter/dragleave fire on the deepest element under the pointer and
    // bubble, so crossing card boundaries fires dragleave on this list with
    // relatedTarget still inside it. Removing the class then would briefly
    // unmask the highlight (flicker) before the next dragover re-adds it.
    // Only un-highlight when the pointer truly leaves the drop area.
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) return;
    const target = event.currentTarget;
    target.classList.remove('drag-over');
    highlightedTargets.delete(target);
  }, []);

  return { onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop };
}