'use client';

import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { BoardContext } from './context';
import { useBoardState } from './hooks/use-board';
import { Board } from './components/board';
import { ErrorBanner } from './components/error-banner';
import { Toolbar } from './components/toolbar';

export function KanbanBoard() {
  const searchParams = useSearchParams();
  const isAgent = useMemo(
    () => searchParams.has('agent') || searchParams.get('mode') === 'agent',
    [searchParams]
  );

  useEffect(() => {
    if (isAgent) document.documentElement.setAttribute('data-agent', '');
    else document.documentElement.removeAttribute('data-agent');

    return () => {
      document.documentElement.removeAttribute('data-agent');
    };
  }, [isAgent]);

  const boardState = useBoardState(isAgent);

  return (
    <BoardContext.Provider value={boardState}>
      <div className="kanban-root">
        <Toolbar />
        <Board />
        <ErrorBanner />
      </div>
    </BoardContext.Provider>
  );
}
