import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useBoard } from '../context';
import type { KanbanCard } from '../types';
import { CardAgentActions } from './card-agent-actions';
import { CardMenu } from './card-menu';
import { ConfirmBar } from './confirm-bar';

interface CardProps {
  card: KanbanCard;
  listId: number;
  onDragStart: (cardId: number) => (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: (event: DragEvent<HTMLDivElement>) => void;
}

export function Card({ card, listId, onDragStart, onDragEnd }: CardProps) {
  const { isAgent, editCard, deleteCard, setError } = useBoard();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editTitle, setEditTitle] = useState(card.title);
  const [editDesc, setEditDesc] = useState(card.description || '');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && titleRef.current) titleRef.current.focus();
  }, [editing]);

  const handleSave = () => {
    const title = editTitle.trim();
    if (!title) return;
    editCard(card.id, title, editDesc.trim()).catch((err) => setError((err as Error).message));
    setEditing(false);
  };

  const handleDelete = () => {
    deleteCard(card.id).catch((err) => {
      setError((err as Error).message);
      setConfirmDelete(false);
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') handleSave();
    if (event.key === 'Escape') setEditing(false);
  };

  if (editing) {
    return (
      <div className="card" role="article" aria-label={`Editing card: ${card.title}`}>
        <div className="inline-form">
          {isAgent && <label htmlFor={`edit-title-${card.id}`}>Title</label>}
          <input
            ref={titleRef}
            id={`edit-title-${card.id}`}
            type="text"
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Card title"
          />
          {isAgent && <label htmlFor={`edit-desc-${card.id}`}>Description</label>}
          <textarea
            id={`edit-desc-${card.id}`}
            value={editDesc}
            onChange={(event) => setEditDesc(event.target.value)}
            aria-label="Card description"
          />
          <div className="inline-form-row">
            <button className="btn btn-primary btn-sm" onClick={handleSave} aria-label="Save card">
              Save
            </button>
            <button className="btn btn-sm" onClick={() => setEditing(false)} aria-label="Cancel edit">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="card"
      draggable={!isAgent}
      onDragStart={onDragStart(card.id)}
      onDragEnd={onDragEnd}
      style={isAgent ? undefined : { cursor: 'grab' }}
      data-card-id={card.id}
      data-list-id={listId}
      role="article"
      aria-label={`Card: ${card.title}`}
    >
      <div className="card-title">{card.title}</div>
      {card.description && <div className="card-desc">{card.description}</div>}

      {confirmDelete ? (
        <ConfirmBar message="Delete this card?" onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)} />
      ) : (
        <>
          {!isAgent && (
            <CardMenu
              onEdit={() => {
                setEditTitle(card.title);
                setEditDesc(card.description || '');
                setEditing(true);
              }}
              onDelete={() => setConfirmDelete(true)}
            />
          )}
          {isAgent && (
            <CardAgentActions
              card={card}
              listId={listId}
              onEdit={() => {
                setEditTitle(card.title);
                setEditDesc(card.description || '');
                setEditing(true);
              }}
              onDelete={() => setConfirmDelete(true)}
            />
          )}
        </>
      )}
    </div>
  );
}
