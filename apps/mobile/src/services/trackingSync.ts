import { accountRepository } from '@/repositories';
import { useSessionStore } from '@/store/sessionStore';
import { useTrackingStore } from '@/store/trackingStore';

/**
 * Sends the tracking outbox to the server and brings back its copy (Phase 5). One send at a
 * time; on failure, waits longer each time (2 s, 5 s, 15 s, 1 min, then every 5 min) and keeps
 * everything queued. Changes have ids, so a send that succeeded but whose answer was lost is
 * simply resent and ignored by the server.
 */
const BACKOFF_MS = [2_000, 5_000, 15_000, 60_000, 300_000];

let running: Promise<void> | null = null;
let again = false;
let failures = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

async function runOnce(): Promise<void> {
  const session = useSessionStore.getState().session;
  const store = useTrackingStore.getState();
  if (!session || session.user.mustChangePassword || !store.hydrated || !online()) return;
  const changes = store.outbox.slice(0, 200);
  try {
    const snapshot = await accountRepository.syncTracking(changes);
    // Signed out or someone else signed in while this was in flight: drop the answer.
    if (useSessionStore.getState().session?.user.id !== session.user.id) return;
    useTrackingStore.getState().acknowledge(
      changes.map((c) => c.id),
      snapshot,
    );
    failures = 0;
    if (useTrackingStore.getState().outbox.length) again = true;
  } catch {
    failures += 1;
    const wait = BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)]!;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void syncTracking(), wait);
  }
}

/** Sync now (or right after the sync already running). */
export function syncTracking(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await runOnce();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

/** After a change: wait for a pause in tapping, then send. */
export function scheduleTrackingSync(delayMs = 800) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void syncTracking(), delayMs);
}
