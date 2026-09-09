import { useEffect } from 'react';
import { useBoard } from '../context';

export function ErrorBanner() {
  const { error, setError } = useBoard();

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [error, setError]);

  if (!error) return null;

  return (
    <div className="error-banner" role="alert">
      {error}
    </div>
  );
}
