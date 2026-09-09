import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useBoard } from '../context';
import type { KanbanCard } from '../types';

interface CardAgentActionsProps {
  card: KanbanCard;
  listId: number;
  onEdit: () => void;
  onDelete: () => void;
}

export function CardAgentActions({ card, listId, onEdit, onDelete }: CardAgentActionsProps) {
  const { board, moveCard, setError } = useBoard();
  const [moveValue, setMoveValue] = useState('');
  const currentList = board.find((list) => list.id === listId);
  const canMoveToEndOfCurrentList =
    currentList !== undefined && currentList.cards[currentList.cards.length - 1]?.id !== card.id;

  const handleMove = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setMoveValue(value);
    if (!value) return;

    const [kind, rawTargetListId] = value.split(':');
    const targetListId = Number.parseInt(rawTargetListId ?? '', 10);
    if (!targetListId) {
      setMoveValue('');
      return;
    }

    const targetList = board.find((list) => list.id === targetListId);
    const position =
      kind === 'end'
        ? Math.max((targetList?.cards.length ?? 1) - 1, 0)
        : targetList?.cards.length ?? 0;

    moveCard(card.id, targetListId, position)
      .then(() => setMoveValue(''))
      .catch((err) => {
        setError('Move failed: ' + (err as Error).message);
        setMoveValue('');
      });
  };

  return (
    <div className="card-actions agent-only" style={{ display: 'flex' }}>
      {(board.length > 1 || canMoveToEndOfCurrentList) && (
        <select
          className="card-move-select"
          value={moveValue}
          onChange={handleMove}
          aria-label="Move card to list"
        >
          <option value="">Move to...</option>
          {canMoveToEndOfCurrentList && currentList && (
            <option value={`end:${currentList.id}`}>Move to end of {currentList.title}</option>
          )}
          {board
            .filter((list) => list.id !== listId)
            .map((list) => (
              <option key={list.id} value={`list:${list.id}`}>
                {list.title}
              </option>
            ))}
        </select>
      )}
      <button className="btn btn-sm" onClick={onEdit} aria-label={`Edit card ${card.title}`}>
        <Pencil size={14} /> Edit
      </button>
      <button
        className="btn btn-sm btn-danger"
        onClick={onDelete}
        aria-label={`Delete card ${card.title}`}
      >
        <Trash2 size={14} /> Delete
      </button>
    </div>
  );
}
