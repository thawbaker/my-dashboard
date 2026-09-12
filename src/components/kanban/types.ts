export interface CardLabel {
  id: number;
  cardId: number;
  name: string;
  color: string;
  createdAt: string;
}

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
  assignee: string | null;
  archivedAt: string | null;
  labels: CardLabel[];
}

export interface KanbanList {
  id: number;
  title: string;
  position: number;
  createdAt: string;
  archivedAt: string | null;
  cards: KanbanCard[];
}

export type BoardData = KanbanList[];

export interface ArchivedCard {
  id: number;
  listId: number;
  title: string;
  description: string;
  archivedAt: string;
  listTitle: string;
  assignee: string | null;
  labels: CardLabel[];
}

export interface ArchivedList {
  id: number;
  title: string;
  archivedAt: string;
  cardCount: number;
  createdAt: string;
}