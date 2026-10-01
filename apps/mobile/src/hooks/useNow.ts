import { useEffect, useState } from 'react';

/** The current time, refreshed every `refreshMs` (so "ended" and countdowns stay right while open). */
export function useNow(refreshMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs]);
  return now;
}
