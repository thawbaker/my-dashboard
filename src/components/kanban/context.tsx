import { createContext, useContext } from 'react';
import type { BoardData } from './types';

export interface BoardContextValue {
  board: BoardData;
  isAgent: boolean;
  loading: boolean;
  error: string | null;
  setError: (msg: string | null) => void;
  refresh: () => Promise<void>;
  addList: (title: string) => Promise<void>;
  renameList: (id: number, title: string) => Promise<void>;
  deleteList: (id: number) => Promise<void>;
  addCard: (listId: number, title: string, description?: string) => Promise<void>;
  editCard: (cardId: number, title: string, description: string) => Promise<void>;
  deleteCard: (cardId: number) => Promise<void>;
  moveCard: (cardId: number, targetListId: number, position: number) => Promise<void>;
  updateCardFields: (cardId: number, fields: Record<string, unknown>) => Promise<void>;
  startWork: (cardId: number) => Promise<void>;
  pauseWork: (cardId: number, duration?: string) => Promise<void>;
  heartbeatWork: (cardId: number, duration: string) => Promise<void>;
  completeCard: (cardId: number) => Promise<void>;
}

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard() {
  const value = useContext(BoardContext);
  if (!value) throw new Error('useBoard must be used within a BoardContext provider');
  return value;
}
