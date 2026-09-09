import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { useBoard } from '../context';

export function Toolbar() {
  const { isAgent, addList, setError } = useBoard();
  const [showForm, setShowForm] = useState(false);
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
          <button className="btn btn-primary" onClick={() => setShowForm(true)} aria-label="Add new list">
            <Plus size={16} /> Add List
          </button>
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
  );
}
