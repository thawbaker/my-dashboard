import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useBoard } from '../context';
import type { KanbanCard } from '../types';
import { CardAgentActions } from './card-agent-actions';
import { CardMenu } from './card-menu';
import { ConfirmBar } from './confirm-bar';
import { TimerDialog } from './timer-dialog';

interface CardProps {
  card: KanbanCard;
  listId: number;
  onDragStart: (cardId: number) => (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: (event: DragEvent<HTMLDivElement>) => void;
}

function hmsToSeconds(hms: string | null | undefined): number {
  if (!hms) return 0;
  const parts = hms.split(':').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function diffDurations(a: string | null | undefined, b: string | null | undefined): string {
  const sDiff = hmsToSeconds(a) - hmsToSeconds(b);
  const abs = Math.abs(sDiff);
  const hh = Math.floor(abs / 3600);
  const mm = Math.floor((abs % 3600) / 60);
  const ss = abs % 60;
  const sign = sDiff < 0 ? '-' : '+';
  return `${sign}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** Convert SQL datetime (YYYY-MM-DD HH:MM:SS) to datetime-local value (YYYY-MM-DDTHH:MM) */
function toDatetimeLocal(sqlDt: string | null | undefined): string {
  if (!sqlDt) return '';
  // Accept either 'YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DDTHH:MM:SS'
  const cleaned = sqlDt.replace(' ', 'T');
  // datetime-local wants YYYY-MM-DDTHH:MM (no seconds)
  return cleaned.length >= 16 ? cleaned.slice(0, 16) : cleaned;
}

export function Card({ card, listId, onDragStart, onDragEnd }: CardProps) {
  const {
    isAgent,
    deleteCard,
    setError,
    updateCardFields,
    startWork,
    pauseWork,
    heartbeatWork,
    completeCard,
  } = useBoard();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(card.title);
  const [editDesc, setEditDesc] = useState(card.description || '');
  const [editEstimated, setEditEstimated] = useState(card.estimatedDuration || '');
  const [editActual, setEditActual] = useState(card.actualDuration || '');
  const [editStart, setEditStart] = useState(toDatetimeLocal(card.startTime));
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && titleRef.current) titleRef.current.focus();
  }, [editing]);

  const normalizeHms = (val: string): string | null => {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(':').map(Number);
    if (parts.length === 2 && parts.every((n) => !isNaN(n))) {
      return `${String(parts[0]).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}:00`;
    }
    if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
      return trimmed;
    }
    return null;
  };

  const handleSave = async (overrides?: Record<string, unknown>) => {
    const title = editTitle.trim();
    if (!title) return;
    const fields: Record<string, unknown> = { title, description: editDesc.trim() };

    const normalizedEst = normalizeHms(editEstimated);
    fields.estimatedDuration = normalizedEst;

    const normalizedAct = normalizeHms(editActual);
    if (normalizedAct !== null) {
      fields.actualDuration = normalizedAct;
    } else if (editActual.trim() === '') {
      // Don't clear actual_duration if empty string — that would lose accumulated time
    }

    // Always send startTime — the completed guard was only needed when
    // the field was read-only after completion. Work now un-completes.
    const trimmed = editStart.trim();
    if (trimmed) {
      const dt = trimmed.replace('T', ' ');
      fields.startTime = dt.length === 16 ? dt + ':00' : dt;
    } else {
      fields.startTime = null;
    }

    // Merge any overrides (e.g. handleWork passes a computed startTime)
    if (overrides) {
      Object.assign(fields, overrides);
    }

    try {
      await updateCardFields(card.id, fields);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    setEditing(false);
  };

  const handleDelete = () => {
    deleteCard(card.id).catch((err) => {
      setError((err as Error).message);
      setConfirmDelete(false);
    });
  };

  const handleWork = async () => {
    // Build overrides: un-complete if needed, stamp start time if missing
    const overrides: Record<string, unknown> = {};

    if (card.completed) {
      overrides.completed = false;
      overrides.endTime = null;
    }

    // If no start time set, stamp it to now
    if (!editStart.trim()) {
      const now = new Date();
      const local =
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T` +
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setEditStart(local);
      overrides.startTime = local.replace('T', ' ') + ':00';
    }

    // Single save with all overrides
    await handleSave(Object.keys(overrides).length > 0 ? overrides : undefined);

    // Open the timer dialog
    setTimerOpen(true);
  };

  const handleComplete = () => {
    completeCard(card.id).catch((err) => setError((err as Error).message));
    setEditing(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') handleSave();
    if (event.key === 'Escape') setEditing(false);
  };

  const variance =
    card.completed && card.estimatedDuration && card.actualDuration
      ? diffDurations(card.actualDuration, card.estimatedDuration)
      : null;

  return (
    <div
      className="card"
      draggable={editing ? false : !isAgent}
      onDragStart={editing ? undefined : onDragStart(card.id)}
      onDragEnd={editing ? undefined : onDragEnd}
      style={isAgent && !editing ? undefined : { cursor: 'grab' }}
      data-card-id={card.id}
      data-list-id={listId}
      role="article"
      aria-label={editing ? `Editing card: ${card.title}` : `Card: ${card.title}`}
    >
      {editing ? (
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

  {/* Time tracking fields */}
          <label htmlFor={`edit-est-${card.id}`}>Estimated Duration (HH:MM:SS) — optional</label>
          <input
            id={`edit-est-${card.id}`}
            type="text"
            value={editEstimated}
            onChange={(event) => setEditEstimated(event.target.value)}
            placeholder="Leave blank or e.g. 01:30:00"
            aria-label="Estimated duration"
          />

          {/* Editable start time — datetime-local picker when not completed */}
          <label htmlFor={`edit-start-${card.id}`}>Start Date/Time</label>
          <input
            id={`edit-start-${card.id}`}
            type="datetime-local"
            value={editStart}
            onChange={(event) => setEditStart(event.target.value)}
            aria-label="Start date/time"
          />

          {/* Editable actual duration */}
          <label htmlFor={`edit-actual-${card.id}`}>Actual Duration (HH:MM:SS)</label>
          <input
            id={`edit-actual-${card.id}`}
            type="text"
            value={editActual}
            onChange={(event) => setEditActual(event.target.value)}
            placeholder="e.g. 00:45:30"
            aria-label="Actual duration"
          />

          {card.endTime && (
            <div className="time-info-row">
              <span className="time-info-label">End:</span>
              <span className="time-info-value">{card.endTime}</span>
            </div>
          )}

          {card.completed && card.estimatedDuration && card.actualDuration && variance && (
            <div
              className={`time-info-row ${
                variance.startsWith('+') && variance > '+00:00:00'
                  ? 'time-info-over'
                  : 'time-info-under'
              }`}
            >
              <span className="time-info-label">Variance:</span>
              <span className="time-info-value">{variance}</span>
            </div>
          )}

          <div className="inline-form-row">
            <button className="btn btn-primary btn-sm" onClick={() => handleSave()} aria-label="Save card">
              Save
            </button>
            <button
              className="btn btn-sm btn-work"
              onClick={handleWork}
              aria-label="Start working on this card"
            >
              Work
            </button>
            <button
              className="btn btn-sm btn-complete"
              onClick={handleComplete}
              aria-label="Mark card as complete"
              disabled={card.completed}
            >
              {card.completed ? 'Done' : 'Complete'}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => setEditing(false)}
              aria-label="Cancel edit"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card-title">
            {card.title}
            {card.completed && (
              <span className="card-completed-badge" title="Completed">
                &#10003;
              </span>
            )}
          </div>
          {card.description && <div className="card-desc">{card.description}</div>}

          {/* Compact time info on card face */}
          {(card.estimatedDuration || card.actualDuration) && (
            <div className="card-time-summary">
              {card.estimatedDuration && (
                <span className="card-time-est" title="Estimated">
                  Est: {card.estimatedDuration}
                </span>
              )}
              {card.actualDuration && (
                <span className="card-time-act" title="Actual">
                  Act: {card.actualDuration}
                </span>
              )}
              {variance && (
                <span
                  className={`card-time-var ${
                    variance.startsWith('+') && variance > '+00:00:00'
                      ? 'card-time-over'
                      : 'card-time-under'
                  }`}
                  title="Variance"
                >
                  {variance}
                </span>
              )}
            </div>
          )}

          {confirmDelete ? (
            <ConfirmBar
              message="Delete this card?"
              onConfirm={handleDelete}
              onCancel={() => setConfirmDelete(false)}
            />
          ) : (
            <>
              {!isAgent && (
                <CardMenu
                  onEdit={() => {
                    setEditTitle(card.title);
                    setEditDesc(card.description || '');
                    setEditEstimated(card.estimatedDuration || '');
                    setEditActual(card.actualDuration || '');
                    setEditStart(toDatetimeLocal(card.startTime));
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
                    setEditEstimated(card.estimatedDuration || '');
                    setEditActual(card.actualDuration || '');
                    setEditStart(toDatetimeLocal(card.startTime));
                    setEditing(true);
                  }}
                  onDelete={() => setConfirmDelete(true)}
                />
              )}
            </>
          )}
        </>
      )}

      {/* Timer dialog renders at card root level, not inside editing block.
          This way it stays visible even after handleSave closes the form. */}
      {timerOpen && (
        <TimerDialog
          cardId={card.id}
          cardTitle={card.title}
          onStart={startWork}
          onPause={pauseWork}
          onHeartbeat={heartbeatWork}
          onClose={() => setTimerOpen(false)}
        />
      )}
    </div>
  );
}