import {
  checklistFor,
  istDayDiff,
  isTracked,
  toEventSummary,
  type ChecklistItem,
  type EventDetail,
  type EventSummary,
  type TrackedEvent,
  type TrackingChange,
  type VisitStatus,
} from '@eii/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { AppState, Platform } from 'react-native';
import { accountRepository } from '@/repositories';
import { analytics } from '@/services/analytics';
import { loadPackIndex, removeAllPacks } from '@/services/offlinePacks';
import { scheduleTrackingSync, syncTracking } from '@/services/trackingSync';
import { useNow } from './useNow';
import { useSessionStore } from '@/store/sessionStore';
import { newChangeId, useTrackingStore } from '@/store/trackingStore';

/** Tracking hooks (Phase 5). Every action updates the screen at once and syncs in the background. */

type Draft = TrackingChange extends infer T ? (T extends TrackingChange ? Omit<T, 'id' | 'at'> : never) : never;

function record(draft: Draft, event?: EventSummary | EventDetail) {
  const change = { ...draft, id: newChangeId(), at: new Date().toISOString() } as TrackingChange;
  useTrackingStore.getState().record(change, event ? toEventSummary(event) : undefined);
  scheduleTrackingSync();
}

export function useTracked(eventId: string | undefined): TrackedEvent | undefined {
  return useTrackingStore((s) => (eventId ? s.view.tracking[eventId] : undefined));
}

/** Save, follow and visit-plan actions for one event. */
export function trackingActions(event: EventSummary | EventDetail) {
  const current = () => useTrackingStore.getState().view.tracking[event.id];
  const eventId = event.id;
  return {
    setSaved: (value: boolean) => {
      analytics.track('event_save', { value });
      record({ type: 'tracking', eventId, field: 'saved', value }, event);
    },
    setFollowing: (value: boolean) => {
      analytics.track('event_follow', { value });
      record({ type: 'tracking', eventId, field: 'following', value }, event);
    },
    setStatus: (value: VisitStatus | null) => {
      // Planning a visit keeps the event in Saved too.
      if (value && value !== 'not_visited' && !current()?.saved) record({ type: 'tracking', eventId, field: 'saved', value: true }, event);
      analytics.track('visit_status', { status: value ?? 'none' });
      record({ type: 'tracking', eventId, field: 'status', value }, event);
    },
    setVisitDate: (value: string | null) => record({ type: 'tracking', eventId, field: 'visitDate', value }, event),
    setTravelNotes: (value: string | null) => record({ type: 'tracking', eventId, field: 'travelNotes', value: value?.trim() ? value : null }, event),
  };
}

export function useNote(eventId: string) {
  return useTrackingStore((s) => s.view.notes[eventId]?.body ?? '');
}

export function saveNote(event: EventSummary | EventDetail, body: string) {
  record({ type: 'note', eventId: event.id, body }, event);
}

export function useChecklist(eventId: string): ChecklistItem[] {
  const items = useTrackingStore((s) => s.view.checklist[eventId]);
  // Recomputed only when this event's items change.
  return useMemo(() => checklistFor({ tracking: {}, notes: {}, checklist: items ? { [eventId]: items } : {} }, eventId), [items, eventId]);
}

export const checklistActions = (event: EventSummary | EventDetail) => ({
  toggle: (item: ChecklistItem) => record({ type: 'checklist', eventId: event.id, itemId: item.id, done: !item.done, ...(item.isDefault ? {} : { label: item.label }) }, event),
  add: (label: string, sort: number) =>
    record({ type: 'checklist', eventId: event.id, itemId: `item_${newChangeId().slice(4)}`, label: label.trim(), sort, done: false }, event),
  remove: (item: ChecklistItem) => record({ type: 'checklist', eventId: event.id, itemId: item.id, deleted: true }, event),
});

export type MyEventsList = 'saved' | 'following' | 'planned' | 'attended' | 'past';

const ended = (e: EventSummary, now: number) => new Date(e.endAt).getTime() < now;

/** My Events (§45): an event can be in several lists. Upcoming lists soonest first; history latest first. */
export function useMyEvents() {
  const view = useTrackingStore((s) => s.view);
  const events = useTrackingStore((s) => s.events);
  const hydrated = useTrackingStore((s) => s.hydrated);
  const now = useNow();
  return useMemo(() => {
    const rows = Object.values(view.tracking)
      .filter(isTracked)
      .map((t) => ({ tracked: t, event: events[t.eventId] }))
      .filter((r): r is { tracked: TrackedEvent; event: EventSummary } => Boolean(r.event));
    const upcoming = (list: typeof rows) => [...list].sort((a, b) => a.event.startAt.localeCompare(b.event.startAt));
    const history = (list: typeof rows) => [...list].sort((a, b) => b.event.startAt.localeCompare(a.event.startAt));
    const planned = (s: VisitStatus | null) => s === 'planning' || s === 'confirmed' || s === 'visiting';
    return {
      hydrated,
      lists: {
        saved: upcoming(rows.filter((r) => r.tracked.saved && !ended(r.event, now))),
        following: upcoming(rows.filter((r) => r.tracked.following && !ended(r.event, now))),
        planned: upcoming(rows.filter((r) => planned(r.tracked.status) && !ended(r.event, now))),
        attended: history(rows.filter((r) => r.tracked.status === 'visited')),
        past: history(rows.filter((r) => ended(r.event, now) && r.tracked.status !== 'visited')),
      } satisfies Record<MyEventsList, typeof rows>,
      /** Ended events you planned to visit and haven't said whether you went (§56). */
      awaitingAnswer: history(rows.filter((r) => ended(r.event, now) && planned(r.tracked.status))),
    };
  }, [view, events, hydrated, now]);
}

export function useVisitors(eventId: string | undefined) {
  // Asked again after each sync, so your own plan shows once the server has it.
  const lastSyncAt = useTrackingStore((s) => s.lastSyncAt);
  return useQuery({
    queryKey: ['events', 'visitors', eventId, lastSyncAt],
    queryFn: () => accountRepository.visitors(eventId!),
    enabled: Boolean(eventId),
    staleTime: 60_000,
  });
}

/**
 * Keeps tracking in step with the server for the signed-in person: starts empty for a new
 * person, syncs on open, when the connection returns and when the app comes back to the front.
 */
export function useTrackingLifecycle() {
  const userId = useSessionStore((s) => (s.session && !s.session.user.mustChangePassword ? s.session.user.id : null));
  const hydrated = useTrackingStore((s) => s.hydrated);
  const owner = useTrackingStore((s) => s.userId);

  useEffect(() => {
    void loadPackIndex();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (owner !== userId) {
      // Someone else's (or nobody's) data must never show: start fresh, and drop their offline packs.
      useTrackingStore.getState().reset(userId);
      if (owner) void removeAllPacks();
    }
    if (userId) void syncTracking();
  }, [hydrated, owner, userId]);

  useEffect(() => {
    if (!userId || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onOnline = () => void syncTracking();
    const onVisible = () => document.visibilityState === 'visible' && void syncTracking();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void syncTracking());
    return () => sub.remove();
  }, [userId]);
}

/** Tracked events happening today (Event Day Mode, §55): saved, followed or planned, not cancelled. */
export function useTodayEvents(): EventSummary[] {
  const view = useTrackingStore((s) => s.view);
  const events = useTrackingStore((s) => s.events);
  const now = useNow();
  return useMemo(() => {
    const endOfToday = new Date(now + 86_400_000);
    return Object.values(view.tracking)
      .filter((t) => isTracked(t) && t.status !== 'not_visited')
      .map((t) => events[t.eventId])
      .filter((e): e is EventSummary => Boolean(e) && e!.status !== 'cancelled')
      .filter((e) => new Date(e.startAt) < endOfToday && new Date(e.endAt).getTime() >= now && istDayDiff(new Date(e.startAt), new Date(now)) <= 0)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [view, events, now]);
}
