import { useState } from 'react';
import { Archive, Ellipsis, Pencil, Trash2 } from 'lucide-react';

interface CardMenuProps {
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function CardMenu({ onEdit, onArchive, onDelete }: CardMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="card-menu-btn human-only"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
        aria-label="Card options"
      >
        <Ellipsis size={16} />
      </button>
      <div className={`card-actions human-actions human-only${open ? ' open' : ''}`}>
        <button className="btn btn-sm" onClick={onEdit} aria-label="Edit card">
          <Pencil size={14} /> Edit
        </button>
        <button className="btn btn-sm" onClick={onArchive} aria-label="Archive card">
          <Archive size={14} /> Archive
        </button>
        <button className="btn btn-sm btn-danger" onClick={onDelete} aria-label="Delete card">
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </>
  );
}