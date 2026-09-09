export interface KanbanCard {
  id: number;
  listId: number;
  title: string;
  description: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  startTime: string | null;
  endTime: string | null;
  estimatedDuration: string | null;
  actualDuration: string | null;
  completed: boolean;
  activeSessionId: number | null;
}

export interface KanbanList {
  id: number;
  title: string;
  position: number;
  createdAt: string;
  cards: KanbanCard[];
}

export type BoardData = KanbanList[];
