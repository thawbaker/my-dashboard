import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, ArrowLeft, Plus, Search, FileText } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { useBoard } from '../context';
import { ArchiveView } from './archive-view';
import { api } from '../api';
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

// ── Report dialog ───────────────────────────────────────────────────────────

interface ReportDialogProps {
  onClose: () => void;
}

function ReportDialog({ onClose }: ReportDialogProps) {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ filename: string; rows: number; totalTime: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!dialogRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [onClose]);

  const handleGenerate = useCallback(async () => {
    if (!startDate || !endDate) return;
    if (startDate > endDate) {
      setErrorMsg('Start date must be before or equal to end date.');
      return;
    }
    setGenerating(true);
    setErrorMsg(null);
    setResult(null);
    try {
      const data = await api<{ filename: string; rows: number; totalTime: string }>(
        'POST',
        '/api/kanban/report',
        { startDate, endDate }
      );
      setResult(data);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [startDate, endDate]);

  return (
    <div className="report-overlay">
      <div className="report-dialog" ref={dialogRef}>
        <div className="report-dialog-header">
          <h2>Task/Time Report</h2>
          <button className="btn btn-sm" onClick={onClose} aria-label="Close report dialog">
            Cancel
          </button>
        </div>

        <div className="report-dialog-body">
          <div className="report-field">
            <label htmlFor="report-start-date">Start Date</label>
            <input
              id="report-start-date"
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setResult(null); setErrorMsg(null); }}
              max={endDate}
              aria-label="Report start date"
            />
          </div>
          <div className="report-field">
            <label htmlFor="report-end-date">End Date</label>
            <input
              id="report-end-date"
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setResult(null); setErrorMsg(null); }}
              min={startDate}
              aria-label="Report end date"
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating || !startDate || !endDate}
            aria-label="Generate report"
          >
            {generating ? 'Generating...' : 'Generate Report'}
          </button>

          {errorMsg && <p className="report-error">{errorMsg}</p>}

          {result && (
            <div className="report-result">
              <p><strong>Report generated!</strong></p>
              <p>File: <code>{result.filename}</code></p>
              <p>Tasks with time: {result.rows}</p>
              <p>Total time: {result.totalTime}</p>
            </div>
          )}
        </div>
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
  const [showReport, setShowReport] = useState(false);
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
              <button className="btn btn-sm" onClick={() => setShowReport(true)} aria-label="Generate time report">
                <FileText size={14} /> Report
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

      {showReport && (
        <ReportDialog onClose={() => setShowReport(false)} />
      )}
    </>
  );
}