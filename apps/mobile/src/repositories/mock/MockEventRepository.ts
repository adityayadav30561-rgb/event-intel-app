import {
  buildHomeFeed,
  clusterMapPoints,
  getCity,
  indexEvents,
  istParts,
  relatedEvents,
  runEventQuery,
  toEventSummary,
  type CityCount,
  type EventDetail,
  type EventQuery,
  type EventSummary,
  type HomeFeed,
  type HomeQuery,
  type MapPin,
  type MapQuery,
  type MapResponse,
  type OrganizerProfile,
  type Page,
  type SyncStatus,
} from '@eii/shared';
import { generateDemoEvents } from '@eii/shared/demo';
import type { EventRepository } from '../types';

/** Simulated network latency, so loading states behave as they will against the live API. */
const LATENCY_MS = 280;
const delay = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), LATENCY_MS));

type Store = { day: string; events: EventDetail[]; index: ReturnType<typeof indexEvents<EventDetail>> };

/**
 * Sample-data repository (spec §149: MockEventRepository). Generates the clearly-labelled
 * demo events once per day, laid out relative to today.
 */
export class MockEventRepository implements EventRepository {
  private store: Store | null = null;

  private data(): Store {
    const now = new Date();
    const p = istParts(now);
    const day = `${p.year}-${p.month}-${p.day}`;
    if (!this.store || this.store.day !== day) {
      const events = generateDemoEvents({ now });
      this.store = { day, events, index: indexEvents(events) };
    }
    return this.store;
  }

  async home(query: HomeQuery): Promise<HomeFeed> {
    return delay(buildHomeFeed(this.data().events, query, new Date(), toEventSummary));
  }

  async search(query: EventQuery): Promise<Page<EventSummary>> {
    const page = runEventQuery(this.data().index, query, new Date());
    return delay({ ...page, items: page.items.map(toEventSummary) });
  }

  async get(id: string): Promise<EventDetail | null> {
    const event = this.data().events.find((e) => e.id === id && e.verificationStatus === 'verified');
    return delay(event ?? null);
  }

  async related(id: string): Promise<EventSummary[]> {
    const { events } = this.data();
    const target = events.find((e) => e.id === id);
    return delay(target ? relatedEvents(target, events).map(toEventSummary) : []);
  }

  async organizer(id: string): Promise<OrganizerProfile | null> {
    const now = new Date();
    const events = this.data().events.filter((e) => e.organizer?.id === id && e.verificationStatus === 'verified');
    const organizer = events[0]?.organizerDetail;
    if (!organizer) return delay(null);
    const byStart = [...events].sort((a, b) => a.startAt.localeCompare(b.startAt));
    return delay({
      organizer,
      upcoming: byStart.filter((e) => new Date(e.endAt) >= now).map(toEventSummary),
      past: byStart.filter((e) => new Date(e.endAt) < now).reverse().map(toEventSummary),
    });
  }

  async cityCounts(): Promise<CityCount[]> {
    const now = new Date();
    const counts = new Map<string, number>();
    for (const e of this.data().events) {
      if (e.verificationStatus === 'verified' && new Date(e.endAt) >= now) counts.set(e.cityId, (counts.get(e.cityId) ?? 0) + 1);
    }
    return delay([...counts.entries()].map(([cityId, count]) => ({ cityId, count })));
  }

  async map(query: MapQuery): Promise<MapResponse> {
    const { west, south, east, north, zoom, ...filters } = query;
    const page = runEventQuery(this.data().index, { ...filters, limit: 5000 }, new Date());
    const pins: MapPin[] = page.items
      .filter((e) => e.attendanceMode !== 'online')
      .map((e) => ({ e, lat: e.venue?.latitude ?? getCity(e.cityId)?.latitude, lng: e.venue?.longitude ?? getCity(e.cityId)?.longitude }))
      .filter((p): p is typeof p & { lat: number; lng: number } => p.lat !== undefined && p.lng !== undefined)
      .filter((p) => p.lat >= south && p.lat <= north && p.lng >= west && p.lng <= east)
      .map(({ e, lat, lng }) => ({ id: e.id, title: e.title, startAt: e.startAt, endAt: e.endAt, eventType: e.eventType, city: e.city, lat, lng }));
    return delay(clusterMapPoints(pins, zoom));
  }

  async syncStatus(): Promise<SyncStatus> {
    return delay({ mode: 'sample', lastUpdatedAt: new Date().toISOString(), status: 'up_to_date', lastRunStatus: null, intervalHours: 12 });
  }
}
