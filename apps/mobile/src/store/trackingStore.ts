import {
  applyTrackingChange,
  EMPTY_TRACKING,
  snapshotToState,
  type EventSummary,
  type TrackingChange,
  type TrackingSnapshot,
  type TrackingState,
} from '@eii/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { localDbStorage } from '@/platform/localDb';

/**
 * Personal tracking on the phone (Phase 5), local-first: every action changes `view` at once and
 * joins the `outbox`; the outbox is sent to the server when there's a connection. `view` is
 * always the last server copy (`base`) with the unsent changes applied on top, so nothing typed
 * offline is lost when a fresh copy arrives.
 */
type TrackingStore = {
  userId: string | null;
  base: TrackingState;
  outbox: TrackingChange[];
  view: TrackingState;
  /** Summaries of tracked events, so My Events works with no network. */
  events: Record<string, EventSummary>;
  lastSyncAt: string | null;
  hydrated: boolean;
  /** Applies a change locally and queues it for the server. */
  record: (change: TrackingChange, event?: EventSummary) => void;
  /** The server accepted `sentIds` and returned its copy. */
  acknowledge: (sentIds: string[], snapshot: TrackingSnapshot) => void;
  /** A different person signed in on this phone (or signed out): start empty. */
  reset: (userId: string | null) => void;
};

const replay = (base: TrackingState, outbox: TrackingChange[]) => outbox.reduce(applyTrackingChange, base);

export const useTrackingStore = create<TrackingStore>()(
  persist(
    (set) => ({
      userId: null,
      base: EMPTY_TRACKING,
      outbox: [],
      view: EMPTY_TRACKING,
      events: {},
      lastSyncAt: null,
      hydrated: false,
      record: (change, event) =>
        set((s) => ({
          outbox: [...s.outbox, change],
          view: applyTrackingChange(s.view, change),
          events: event && !s.events[event.id] ? { ...s.events, [event.id]: event } : s.events,
        })),
      acknowledge: (sentIds, snapshot) =>
        set((s) => {
          const sent = new Set(sentIds);
          const outbox = s.outbox.filter((c) => !sent.has(c.id));
          const base = snapshotToState(snapshot);
          // Fresh summaries from the server; keep local ones for events whose changes are still queued.
          const events: Record<string, EventSummary> = Object.fromEntries(snapshot.events.map((e) => [e.id, e]));
          for (const c of outbox) if (!events[c.eventId] && s.events[c.eventId]) events[c.eventId] = s.events[c.eventId]!;
          return { base, outbox, view: replay(base, outbox), events, lastSyncAt: snapshot.serverTime };
        }),
      reset: (userId) => set({ userId, base: EMPTY_TRACKING, outbox: [], view: EMPTY_TRACKING, events: {}, lastSyncAt: null }),
    }),
    {
      name: 'eii.tracking',
      storage: createJSONStorage(() => localDbStorage),
      partialize: (s) => ({ userId: s.userId, base: s.base, outbox: s.outbox, events: s.events, lastSyncAt: s.lastSyncAt }),
      onRehydrateStorage: () => (state) => {
        // The view isn't stored: rebuild it from the server copy and the queue.
        if (state) useTrackingStore.setState({ view: replay(state.base, state.outbox), hydrated: true });
        else useTrackingStore.setState({ hydrated: true });
      },
    },
  ),
);

export const newChangeId = () => `chg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
