import { useBoard } from '../context';
import { useColumnDrag } from '../hooks/use-column-drag';
import { List } from './list';

export function Board() {
  const { board, loading, reorderLists, setError } = useBoard();
  const { onHeaderDragStart, onHeaderDragEnd, onBoardDragOver, onBoardDragLeave, onBoardDrop } =
    useColumnDrag(reorderLists, setError);

  return (
    <div
      className="board"
      id="board"
      onDragOver={onBoardDragOver}
      onDragLeave={onBoardDragLeave}
      onDrop={onBoardDrop}
    >
      {loading && board.length === 0 ? (
        <div className="board-loading">Loading board...</div>
      ) : board.length === 0 ? (
        <div className="board-empty" role="status">
          <div className="board-empty-title">No lists yet</div>
          <div className="board-empty-copy">Create your first list to start the board.</div>
        </div>
      ) : (
        board.map((list, index) => (
          <List
            key={list.id}
            list={list}
            index={index}
            onHeaderDragStart={onHeaderDragStart}
            onHeaderDragEnd={onHeaderDragEnd}
          />
        ))
      )}
    </div>
  );
}