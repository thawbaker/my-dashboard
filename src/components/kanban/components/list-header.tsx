import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useBoard } from '../context';
import type { KanbanList } from '../types';
import { ConfirmBar } from './confirm-bar';

interface ListHeaderProps {
  list: KanbanList;
  color: string;
}

export function ListHeader({ list, color }: ListHeaderProps) {
  const { isAgent, renameList, deleteList, setError } = useBoard();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const handleRename = () => {
    const value = renameValue.trim();
    if (!value) return;
    renameList(list.id, value).catch((err) => setError((err as Error).message));
    setRenaming(false);
  };

  const handleDelete = () => {
    deleteList(list.id).catch((err) => {
      setError((err as Error).message);
      setConfirmDelete(false);
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') handleRename();
    if (event.key === 'Escape') setRenaming(false);
  };

  return (
    <div className="list-header" style={{ background: color }}>
      <div className="list-header-left">
        {renaming ? (
          <>
            {isAgent && (
              <label htmlFor={`rename-list-${list.id}`} style={{ color: '#fff', fontSize: '11px' }}>
                New list name
              </label>
            )}
            <input
              ref={inputRef}
              id={`rename-list-${list.id}`}
              type="text"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Rename list"
              style={{ flex: 1, color: '#333' }}
            />
            <button className="btn btn-sm" style={{ color: '#333' }} onClick={handleRename} aria-label="Save list name">
              Save
            </button>
            <button className="btn btn-sm" style={{ color: '#333' }} onClick={() => setRenaming(false)} aria-label="Cancel rename">
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="human-only" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <span
                className="list-title clickable"
                onClick={() => {
                  setRenameValue(list.title);
                  setRenaming(true);
                }}
                title="Click to rename"
              >
                {list.title}
              </span>
            </span>
            <span className="agent-only" style={{ alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <span className="list-title">{list.title}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setRenameValue(list.title);
                  setRenaming(true);
                }}
                aria-label={`Rename list ${list.title}`}
              >
                Rename
              </button>
            </span>
            <span className="list-count">{list.cards.length}</span>
          </>
        )}
      </div>

      {confirmDelete ? (
        <ConfirmBar
          message="Delete list?"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
          confirmLabel="Yes"
          cancelLabel="No"
          style={{ color: '#fff' }}
        />
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(true)} aria-label={`Delete list ${list.title}`}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
