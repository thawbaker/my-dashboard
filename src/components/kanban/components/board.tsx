import { useBoard } from '../context';
import { List } from './list';

export function Board() {
  const { board, loading } = useBoard();

  return (
    <div className="board" id="board">
      {loading && board.length === 0 ? (
        <div className="board-loading">Loading board...</div>
      ) : board.length === 0 ? (
        <div className="board-empty" role="status">
          <div className="board-empty-title">No lists yet</div>
          <div className="board-empty-copy">Create your first list to start the board.</div>
        </div>
      ) : (
        board.map((list, index) => <List key={list.id} list={list} index={index} />)
      )}
    </div>
  );
}
