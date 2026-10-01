import type { CityCount, EventDetail, EventQuery, EventSummary, HomeFeed, HomeQuery, OrganizerProfile, Page, SyncStatus } from '@eii/shared';
import type { EventRepository } from '../types';

/** A failed API call, classified so screens can offer the right recovery (spec §89). */
export class ApiError extends Error {
  constructor(
    readonly kind: 'network' | 'timeout' | 'server' | 'not_found' | 'bad_request',
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** The free server sleeps when idle; the first request after a pause can take a while. */
const TIMEOUT_MS = 30_000;

type Params = Record<string, string | number | boolean | string[] | undefined | null>;

function toQueryString(params: Params): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
    } else search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Live data from the Event Intelligence API (docs/DEVELOPMENT_PLAN.md §7). */
export class ApiEventRepository implements EventRepository {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, params: Params = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}${toQueryString(params)}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
    } catch (error) {
      throw controller.signal.aborted
        ? new ApiError('timeout', 'The server took too long to respond.')
        : new ApiError('network', error instanceof Error ? error.message : 'Network request failed');
    } finally {
      clearTimeout(timer);
    }
    if (response.ok) return (await response.json()) as T;
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(response.status === 404 ? 'not_found' : response.status < 500 ? 'bad_request' : 'server', message, response.status);
  }

  private async orNull<T>(promise: Promise<T>): Promise<T | null> {
    try {
      return await promise;
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'not_found') return null;
      throw error;
    }
  }

  home(query: HomeQuery): Promise<HomeFeed> {
    return this.request('/home', { cityIds: query.cityIds });
  }

  search(query: EventQuery): Promise<Page<EventSummary>> {
    return this.request('/events', query as Params);
  }

  get(id: string): Promise<EventDetail | null> {
    return this.orNull(this.request(`/events/${encodeURIComponent(id)}`));
  }

  async related(id: string): Promise<EventSummary[]> {
    return (await this.request<{ items: EventSummary[] }>(`/events/${encodeURIComponent(id)}/related`)).items;
  }

  organizer(id: string): Promise<OrganizerProfile | null> {
    return this.orNull(this.request(`/organizers/${encodeURIComponent(id)}`));
  }

  async cityCounts(): Promise<CityCount[]> {
    const { items } = await this.request<{ items: { id: string; upcomingCount: number }[] }>('/cities');
    return items.filter((c) => c.upcomingCount > 0).map((c) => ({ cityId: c.id, count: c.upcomingCount }));
  }

  syncStatus(): Promise<SyncStatus> {
    return this.request('/sync/status');
  }
}
