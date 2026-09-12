import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Archive, Trash2, X } from 'lucide-react';
import { useBoard } from '../context';
import type { KanbanList } from '../types';

interface ListHeaderProps {
  list: KanbanList;
  color: string;
  onDragStart: (listId: number) => (event: DragEvent<HTMLElement>) => void;
  onDragEnd: (event: DragEvent<HTMLElement>) => void;
}

export function ListHeader({ list, color, onDragStart, onDragEnd }: ListHeaderProps) {
  const { isAgent, renameList, archiveList, deleteList, setError } = useBoard();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list.title);
  const [showActions, setShowActions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  useEffect(() => {
    if (!showActions) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setShowActions(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showActions]);

  const handleRename = () => {
    const value = renameValue.trim();
    if (!value) return;
    renameList(list.id, value).catch((err) => setError((err as Error).message));
    setRenaming(false);
  };

  const handleArchive = () => {
    archiveList(list.id).catch((err) => setError((err as Error).message));
    setShowActions(false);
  };

  const handleDelete = () => {
    deleteList(list.id).catch((err) => setError((err as Error).message));
    setShowActions(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') handleRename();
    if (event.key === 'Escape') setRenaming(false);
  };

  return (
    <div
      className="list-header"
      style={{ background: color, cursor: isAgent ? 'default' : 'grab' }}
      draggable={!isAgent && !renaming}
      onDragStart={renaming ? undefined : onDragStart(list.id)}
      onDragEnd={renaming ? undefined : onDragEnd}
      data-list-id={list.id}
    >
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
                title="Click to rename. Drag to reorder."
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

      <div className="list-header-actions" style={{ position: 'relative' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowActions(!showActions)}
          aria-label={`List actions for ${list.title}`}
        >
          <X size={14} />
        </button>
        {showActions && (
          <div
            ref={actionsRef}
            className="list-actions-popover"
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 20,
              minWidth: '180px',
              padding: '4px',
            }}
          >
            <button
              className="btn btn-sm"
              style={{ width: '100%', justifyContent: 'flex-start', border: 'none', borderRadius: '4px' }}
              onClick={handleArchive}
              aria-label="Archive list and its cards"
            >
              <Archive size={14} /> Archive all cards
            </button>
            <button
              className="btn btn-sm btn-danger"
              style={{ width: '100%', justifyContent: 'flex-start', border: 'none', borderRadius: '4px' }}
              onClick={handleDelete}
              aria-label="Permanently delete list"
            >
              <Trash2 size={14} /> Delete permanently
            </button>
          </div>
        )}
      </div>
    </div>
  );
}