import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { BoardContextValue } from '../context';
import type { BoardData, KanbanCard, ArchivedCard, ArchivedList } from '../types';

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
    const t = setTimeout(refresh);
    return () => clearTimeout(t);
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

  const archiveList = useCallback(
    async (id: number) => {
      await api('POST', `/api/kanban/lists/${id}/archive`);
      await refresh();
    },
    [refresh]
  );

  const reorderLists = useCallback(
    async (orderedIds: number[]) => {
      await api('PUT', '/api/kanban/lists/reorder', { orderedIds });
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

  const updateCardFields = useCallback(
    async (cardId: number, fields: Record<string, unknown>) => {
      await api('PUT', `/api/kanban/cards/${cardId}`, fields);
      await refresh();
    },
    [refresh]
  );

  const addLabel = useCallback(
    async (cardId: number, name: string, color: string) => {
      await api('POST', `/api/kanban/cards/${cardId}/labels`, { name, color });
      await refresh();
    },
    [refresh]
  );

  const removeLabel = useCallback(
    async (cardId: number, labelId: number) => {
      await api('DELETE', `/api/kanban/cards/${cardId}/labels/${labelId}`);
      await refresh();
    },
    [refresh]
  );

  const startWork = useCallback(
    async (cardId: number) => {
      await api('POST', `/api/kanban/cards/${cardId}/work`);
      await refresh();
    },
    [refresh]
  );

  const pauseWork = useCallback(
    async (cardId: number, duration?: string) => {
      const body: Record<string, unknown> = {};
      if (duration) body.duration = duration;
      const data = await api<{ card?: unknown; session?: unknown }>(
        'POST',
        `/api/kanban/cards/${cardId}/work/pause`,
        body
      );
      if (data.card) {
        setBoard((prev) =>
          prev.map((list) => ({
            ...list,
            cards: list.cards.map((c) => (c.id === cardId ? { ...c, ...(data.card as Partial<KanbanCard>) } : c)),
          }))
        );
      }
    },
    []
  );

  const heartbeatWork = useCallback(
    async (cardId: number, duration: string) => {
      const data = await api<{ card?: unknown }>(
        'POST',
        `/api/kanban/cards/${cardId}/work`,
        { duration }
      );
      if (data.card) {
        setBoard((prev) =>
          prev.map((list) => ({
            ...list,
            cards: list.cards.map((c) => (c.id === cardId ? { ...c, ...(data.card as Partial<KanbanCard>) } : c)),
          }))
        );
      }
    },
    []
  );

  const completeCardAction = useCallback(
    async (cardId: number) => {
      await api('POST', `/api/kanban/cards/${cardId}/complete`);
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

  const archiveCard = useCallback(
    async (cardId: number) => {
      await api('POST', `/api/kanban/cards/${cardId}/archive`);
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

  const getArchivedItems = useCallback(async () => {
    const data = await api<{ lists: ArchivedList[]; cards: ArchivedCard[] }>('GET', '/api/kanban/archive');
    return data;
  }, []);

  const restoreArchived = useCallback(
    async (kind: 'card' | 'list', id: number) => {
      await api('POST', `/api/kanban/archive/${kind}/${id}`);
      await refresh();
    },
    [refresh]
  );

  const permanentlyDeleteArchived = useCallback(
    async (kind: 'card' | 'list', id: number) => {
      await api('DELETE', `/api/kanban/archive/${kind}/${id}`);
    },
    []
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
    archiveList,
    reorderLists,
    addCard,
    editCard,
    deleteCard,
    archiveCard,
    moveCard,
    updateCardFields,
    addLabel,
    removeLabel,
    startWork,
    pauseWork,
    heartbeatWork,
    completeCard: completeCardAction,
    getArchivedItems,
    restoreArchived,
    permanentlyDeleteArchived,
  };
}