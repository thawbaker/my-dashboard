import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { BoardContextValue } from '../context';
import type { BoardData } from '../types';

export function useBoardState(isAgent: boolean): BoardContextValue {
  const [board, setBoard] = useState<BoardData>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ lists: BoardData }>('GET', '/api/kanban');
      setBoard(data.lists || []);
    } catch (err) {
      setError('Failed to load board: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const HEARTBEAT_MS = 5 * 60 * 1000;

    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/auth/me');
        if (response.status === 401) {
          window.location.replace('/sign-in');
        }
      } catch {
        // Keep the session; the next beat retries.
      }
    };

    const timer = setInterval(check, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const addList = useCallback(
    async (title: string) => {
      await api('POST', '/api/kanban/lists', { title });
      await refresh();
    },
    [refresh]
  );

  const renameList = useCallback(
    async (id: number, title: string) => {
      await api('PUT', `/api/kanban/lists/${id}`, { title });
      await refresh();
    },
    [refresh]
  );

  const deleteList = useCallback(
    async (id: number) => {
      await api('DELETE', `/api/kanban/lists/${id}`);
      await refresh();
    },
    [refresh]
  );

  const addCard = useCallback(
    async (listId: number, title: string, description?: string) => {
      await api('POST', '/api/kanban/cards', { listId, title, description: description || '' });
      await refresh();
    },
    [refresh]
  );

  const editCard = useCallback(
    async (cardId: number, title: string, description: string) => {
      await api('PUT', `/api/kanban/cards/${cardId}`, { title, description });
      await refresh();
    },
    [refresh]
  );

  const deleteCard = useCallback(
    async (cardId: number) => {
      await api('DELETE', `/api/kanban/cards/${cardId}`);
      await refresh();
    },
    [refresh]
  );

  const moveCard = useCallback(
    async (cardId: number, targetListId: number, position: number) => {
      await api('POST', `/api/kanban/cards/${cardId}/move`, { targetListId, position });
      await refresh();
    },
    [refresh]
  );

  return {
    board,
    isAgent,
    loading,
    error,
    setError,
    refresh,
    addList,
    renameList,
    deleteList,
    addCard,
    editCard,
    deleteCard,
    moveCard,
  };
}
