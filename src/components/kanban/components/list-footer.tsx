import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useBoard } from '../context';
import type { KanbanList } from '../types';

interface ListFooterProps {
  list: KanbanList;
}

export function ListFooter({ list }: ListFooterProps) {
  const { isAgent, addCard, setError } = useBoard();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showForm && titleRef.current) titleRef.current.focus();
  }, [showForm]);

  const handleAdd = () => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    addCard(list.id, nextTitle, description.trim() || undefined).catch((err) =>
      setError((err as Error).message)
    );
    setTitle('');
    setDescription('');
    if (!isAgent) setShowForm(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') handleAdd();
    if (event.key === 'Escape') {
      setShowForm(false);
      setTitle('');
      setDescription('');
    }
  };

  return (
    <div className="list-footer">
      {!isAgent && !showForm && (
        <div className="human-only">
          <button
            className="btn btn-sm"
            style={{ width: '100%' }}
            onClick={() => setShowForm(true)}
            aria-label={`Add card to ${list.title}`}
          >
            <Plus size={14} /> Add Card
          </button>
        </div>
      )}

      {!isAgent && showForm && (
        <div className="inline-form human-only">
          <input
            ref={titleRef}
            type="text"
            placeholder="Card title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Card title"
          />
          <div className="inline-form-row">
            <button className="btn btn-primary btn-sm" onClick={handleAdd} aria-label="Add card">
              Add
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                setShowForm(false);
                setTitle('');
                setDescription('');
              }}
              aria-label="Cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isAgent && (
        <div className="agent-only-block agent-only" style={{ display: 'block' }}>
          <div className="inline-form">
            <label htmlFor={`agent-card-title-${list.id}`}>New card title</label>
            <input
              id={`agent-card-title-${list.id}`}
              type="text"
              placeholder="Card title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label={`New card title for ${list.title}`}
            />
            <label htmlFor={`agent-card-desc-${list.id}`}>Description (optional)</label>
            <input
              id={`agent-card-desc-${list.id}`}
              type="text"
              placeholder="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              aria-label={`New card description for ${list.title}`}
            />
            <button className="btn btn-primary btn-sm" onClick={handleAdd} aria-label={`Add card to ${list.title}`}>
              Add Card
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
