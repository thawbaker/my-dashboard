export interface KanbanCard {
  id: number;
  listId: number;
  title: string;
  description: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanList {
  id: number;
  title: string;
  position: number;
  createdAt: string;
  cards: KanbanCard[];
}

export type BoardData = KanbanList[];
