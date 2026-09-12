'use client';

import { useEffect, useState, useCallback } from 'react';
import { Archive, ArrowLeft, Trash2, RotateCcw } from 'lucide-react';
import { useBoard } from '../context';
import type { ArchivedCard, ArchivedList } from '../types';

interface ArchiveViewProps {
  onClose: () => void;
}

export function ArchiveView({ onClose }: ArchiveViewProps) {
  const { getArchivedItems, restoreArchived, permanentlyDeleteArchived, isAgent, setError } = useBoard();
  const [lists, setLists] = useState<ArchivedList[]>([]);
  const [cards, setCards] = useState<ArchivedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'card' | 'list'; id: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getArchivedItems();
      setLists(data.lists);
      setCards(data.cards);
    } catch (err) {
      setError('Failed to load archive: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getArchivedItems, setError]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = async (kind: 'card' | 'list', id: number) => {
    try {
      await restoreArchived(kind, id);
      await load();
    } catch (err) {
      setError('Failed to restore: ' + (err as Error).message);
    }
  };

  const handlePermanentDelete = async (kind: 'card' | 'list', id: number) => {
    try {
      await permanentlyDeleteArchived(kind, id);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setError('Failed to delete: ' + (err as Error).message);
    }
  };

  const totalItems = lists.length + cards.length;

  return (
    <div className="archive-view">
      <div className="archive-header">
        <button className="btn btn-sm" onClick={onClose} aria-label="Back to board">
          <ArrowLeft size={14} /> Back to Board
        </button>
        <h2 className="archive-title">
          <Archive size={16} /> Archive
          {totalItems > 0 && <span className="archive-count">{totalItems} item{totalItems !== 1 ? 's' : ''}</span>}
        </h2>
      </div>

      {loading ? (
        <div className="archive-loading">Loading archive...</div>
      ) : totalItems === 0 ? (
        <div className="archive-empty" role="status">
          <div className="archive-empty-title">Archive is empty</div>
          <div className="archive-empty-copy">Archived cards and lists will appear here.</div>
        </div>
      ) : (
        <div className="archive-items">
          {/* Archived lists */}
          {lists.length > 0 && (
            <div className="archive-section">
              <h3 className="archive-section-title">Archived Lists</h3>
              {lists.map((list) => (
                <div key={`list-${list.id}`} className="archive-item archive-item-list">
                  <div className="archive-item-info">
                    <span className="archive-item-name">{list.title}</span>
                    <span className="archive-item-meta">
                      {list.cardCount} card{list.cardCount !== 1 ? 's' : ''} &middot; archived{' '}
                      {new Date(list.archivedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="archive-item-actions">
                    <button
                      className="btn btn-sm"
                      onClick={() => handleRestore('list', list.id)}
                      aria-label={`Restore list ${list.title}`}
                    >
                      <RotateCcw size={14} /> Restore
                    </button>
                    {confirmDelete?.kind === 'list' && confirmDelete.id === list.id ? (
                      <div className="confirm-bar" style={{ display: 'inline-flex' }}>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handlePermanentDelete('list', list.id)}
                          aria-label="Confirm delete"
                        >
                          Yes, delete
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => setConfirmDelete(null)}
                          aria-label="Cancel"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => setConfirmDelete({ kind: 'list', id: list.id })}
                        aria-label={`Permanently delete list ${list.title}`}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Archived cards */}
          {cards.length > 0 && (
            <div className="archive-section">
              <h3 className="archive-section-title">Archived Cards</h3>
              {cards.map((card) => (
                <div key={`card-${card.id}`} className="archive-item archive-item-card">
                  <div className="archive-item-info">
                    <span className="archive-item-name">{card.title}</span>
                    {card.description && (
                      <span className="archive-item-desc">{card.description}</span>
                    )}
                    <span className="archive-item-meta">
                      From: {card.listTitle}
                      {card.assignee && ` \u2022 Assigned to: ${card.assignee}`}
                      {' \u2022 '}archived {new Date(card.archivedAt).toLocaleDateString()}
                    </span>
                    {card.labels.length > 0 && (
                      <div className="archive-item-labels">
                        {card.labels.map((label) => (
                          <span
                            key={label.id}
                            className="label-chip"
                            style={{ background: label.color }}
                          >
                            {label.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="archive-item-actions">
                    <button
                      className="btn btn-sm"
                      onClick={() => handleRestore('card', card.id)}
                      aria-label={`Restore card ${card.title}`}
                    >
                      <RotateCcw size={14} /> Restore
                    </button>
                    {confirmDelete?.kind === 'card' && confirmDelete.id === card.id ? (
                      <div className="confirm-bar" style={{ display: 'inline-flex' }}>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handlePermanentDelete('card', card.id)}
                          aria-label="Confirm delete"
                        >
                          Yes, delete
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => setConfirmDelete(null)}
                          aria-label="Cancel"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => setConfirmDelete({ kind: 'card', id: card.id })}
                        aria-label={`Permanently delete card ${card.title}`}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}