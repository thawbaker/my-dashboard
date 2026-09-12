import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowLeft, Plus, Search } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { useBoard } from '../context';
import { ArchiveView } from './archive-view';
import type { BoardData } from '../types';

// ── Search & filter bar ─────────────────────────────────────────────────────

interface SearchFilterBarProps {
  onClose: () => void;
  board: BoardData;
}

function SearchFilterBar({ onClose, board }: SearchFilterBarProps) {
  const [searchText, setSearchText] = useState('');
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<string>('');

  // Collect all unique colors present on the board
  const allColors = new Map<string, string>();
  for (const list of board) {
    for (const card of list.cards) {
      for (const label of card.labels) {
        allColors.set(label.color, label.name);
      }
    }
  }

  // Collect all unique assignees
  const allAssignees = new Set<string>();
  for (const list of board) {
    for (const card of list.cards) {
      if (card.assignee) allAssignees.add(card.assignee);
    }
  }

  const toggleColor = (color: string) => {
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]
    );
  };

  // Apply filters to visible cards by setting display style
  useEffect(() => {
    const allCards = document.querySelectorAll<HTMLElement>('[data-card-id]');
    for (const el of allCards) {
      const cardId = Number(el.dataset.cardId);
      let card: (typeof board)[number]['cards'][number] | undefined;
      for (const list of board) {
        const found = list.cards.find((c) => c.id === cardId);
        if (found) { card = found; break; }
      }
      if (!card) { el.style.display = ''; continue; }

      let visible = true;

      // Search filter
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        const matchTitle = card.title.toLowerCase().includes(q);
        const matchDesc = card.description.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc) visible = false;
      }

      // Label color filter
      if (visible && selectedColors.length > 0) {
        const cardColors = card.labels.map((l) => l.color);
        const hasMatch = selectedColors.some((c) => cardColors.includes(c));
        if (!hasMatch) visible = false;
      }

      // Assignee filter
      if (visible && selectedAssignee) {
        if ((card.assignee || '') !== selectedAssignee) visible = false;
      }

      el.style.display = visible ? '' : 'none';
    }
  }, [searchText, selectedColors, selectedAssignee, board]);

  return (
    <div className="search-filter-bar">
      <div className="search-filter-row">
        <div className="search-filter-input-wrap">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search cards by title or description..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            aria-label="Search cards"
          />
          {searchText && (
            <button className="btn btn-sm" onClick={() => setSearchText('')} aria-label="Clear search">Clear</button>
          )}
        </div>
        <button className="btn btn-sm" onClick={onClose} aria-label="Close filter bar">Done</button>
      </div>

      <div className="search-filter-row">
        {allColors.size > 0 && (
          <div className="filter-group">
            <span className="filter-label">Labels:</span>
            <div className="filter-chips">
              {Array.from(allColors.entries()).map(([color, name]) => (
                <button
                  key={color}
                  className={`filter-chip ${selectedColors.includes(color) ? 'filter-chip-active' : ''}`}
                  style={{ background: selectedColors.includes(color) ? color : 'transparent', borderColor: color }}
                  onClick={() => toggleColor(color)}
                  aria-label={`Filter by label ${name}`}
                  title={name}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {allAssignees.size > 0 && (
          <div className="filter-group">
            <span className="filter-label">Assignee:</span>
            <select
              value={selectedAssignee}
              onChange={(e) => setSelectedAssignee(e.target.value)}
              aria-label="Filter by assignee"
              style={{ minHeight: '28px', fontSize: '12px', width: 'auto' }}
            >
              <option value="">All</option>
              {Array.from(allAssignees).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Toolbar ─────────────────────────────────────────────────────────────────

interface ToolbarProps {
  onShowArchive: () => void;
}

export function Toolbar({ onShowArchive }: ToolbarProps) {
  const { isAgent, addList, setError, board } = useBoard();
  const [showForm, setShowForm] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showForm && inputRef.current) inputRef.current.focus();
  }, [showForm]);

  useEffect(() => {
    if (!showForm) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        setShowForm(false);
        setTitle('');
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showForm]);

  const handleAdd = () => {
    const value = title.trim();
    if (!value) return;
    addList(value)
      .then(() => {
        setTitle('');
        setShowForm(false);
      })
      .catch((err) => setError((err as Error).message));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') handleAdd();
    if (event.key === 'Escape') {
      setShowForm(false);
      setTitle('');
    }
  };

  return (
    <>
      <header className="toolbar">
        <div className="toolbar-left">
          <Link href="/dashboard" className="toolbar-back">
            <ArrowLeft size={16} /> Dashboard
          </Link>
          <h1 className="toolbar-title">Kanban Board</h1>
        </div>
        <div className="toolbar-right">
          <ThemeToggle />
          {!showForm && (
            <>
              <button className="btn btn-sm" onClick={() => setShowSearch(true)} aria-label="Search and filter">
                <Search size={14} /> Filter
              </button>
              <button className="btn btn-sm" onClick={onShowArchive} aria-label="View archive">
                <Archive size={14} /> Archive
              </button>
              <button className="btn btn-primary" onClick={() => setShowForm(true)} aria-label="Add new list">
                <Plus size={16} /> Add List
              </button>
            </>
          )}
          {showForm && (
            <div className="add-list-popover" ref={popoverRef}>
              <div className="inline-form">
                {isAgent && <label htmlFor="new-list-input">List title</label>}
                <input
                  ref={inputRef}
                  id="new-list-input"
                  type="text"
                  placeholder="List title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onKeyDown={handleKeyDown}
                  aria-label="New list title"
                />
                <div className="inline-form-row">
                  <button className="btn btn-primary btn-sm" onClick={handleAdd} aria-label="Save new list">
                    Add
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setShowForm(false);
                      setTitle('');
                    }}
                    aria-label="Cancel"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {showSearch && (
        <SearchFilterBar
          onClose={() => setShowSearch(false)}
          board={board}
        />
      )}
    </>
  );
}