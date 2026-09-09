import { useEffect, useRef, useState, useCallback } from 'react';

interface TimerDialogProps {
  cardId: number;
  cardTitle: string;
  onStart: (cardId: number) => Promise<void>;
  onPause: (cardId: number, duration: string) => Promise<void>;
  onHeartbeat: (cardId: number, duration: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Timer dialog that pops up after pressing "Work" on a card.
 * Green Start begins the timer; red Pause stops it and saves to DB.
 * Heartbeat every 15s persists in-progress time so page reloads are safe.
 */
export function TimerDialog({
  cardId,
  cardTitle,
  onStart,
  onPause,
  onHeartbeat,
  onClose,
}: TimerDialogProps) {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const runningRef = useRef(false);
  const syncLockRef = useRef(false);

  const formatTime = useCallback((totalSec: number): string => {
    const s = Math.max(0, Math.floor(totalSec));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }, []);

  const doPause = useCallback(async () => {
    if (runningRef.current) {
      runningRef.current = false;
      setRunning(false);

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      // Sync final duration to server using exact client-side elapsed time
      if (!syncLockRef.current) {
        syncLockRef.current = true;
        try {
          const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          const dur = formatTime(elapsed);
          await onPause(cardId, dur);
        } finally {
          syncLockRef.current = false;
        }
      }
    }
  }, [cardId, onPause, formatTime]);

  const doStart = useCallback(async () => {
    if (!runningRef.current) {
      runningRef.current = true;
      startTimeRef.current = Date.now();
      setRunning(true);
      setSeconds(0);

      try {
        await onStart(cardId);
      } catch {
        // Session start failed — revert
        runningRef.current = false;
        setRunning(false);
        return;
      }

      // Tick every 100ms for smooth display
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setSeconds(elapsed);
      }, 100);

      // Heartbeat every 15s to persist current duration
      heartbeatRef.current = setInterval(async () => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const dur = formatTime(elapsed);
        try {
          await onHeartbeat(cardId, dur);
        } catch {
          // Swallow heartbeat errors — the next beat will retry
        }
      }, 15_000);
    }
  }, [cardId, onStart, onHeartbeat, formatTime]);

  const handleClose = useCallback(() => {
    if (runningRef.current) {
      void doPause().then(() => onClose());
    } else {
      onClose();
    }
  }, [doPause, onClose]);

  // Pause on unmount (e.g. dialog closed via Escape)
  useEffect(() => {
    return () => {
      if (runningRef.current) {
        runningRef.current = false;
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      }
    };
  }, []);

  const timerValue = formatTime(seconds);
  const isIdle = !running && seconds === 0;

  return (
    <div className="timer-dialog-overlay" onClick={handleClose}>
      <div
        className="timer-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Timer for card: ${cardTitle}`}
      >
        <button className="timer-dialog-close" onClick={handleClose} aria-label="Close timer dialog">
          &times;
        </button>

        <div className="timer-dialog-title">Working on: {cardTitle}</div>

        <div className={`timer-display ${running ? 'running' : ''}`}>
          {timerValue}
        </div>

        <div className="timer-dialog-actions">
          {!running ? (
            <button
              className="timer-btn timer-btn-start"
              onClick={doStart}
              disabled={running}
              aria-label="Start timer"
            >
              {isIdle ? 'Start' : 'Resume'}
            </button>
          ) : (
            <button
              className="timer-btn timer-btn-pause"
              onClick={doPause}
              aria-label="Pause timer"
            >
              Pause
            </button>
          )}
        </div>

        <div className="timer-dialog-footer">
          <button className="timer-btn timer-btn-close" onClick={handleClose}>
            {running ? 'Pause & Close' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}