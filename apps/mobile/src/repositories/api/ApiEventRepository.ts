import type { CityCount, EventDetail, EventQuery, EventSummary, HomeFeed, HomeQuery, MapQuery, MapResponse, OrganizerProfile, Page, SyncStatus } from '@eii/shared';
import type { EventRepository } from '../types';
import { ApiError, type ApiClient, type Params } from './client';

/** Live data from the Event Intelligence API (docs/DEVELOPMENT_PLAN.md §7). */
export class ApiEventRepository implements EventRepository {
  constructor(private readonly api: ApiClient) {}

  private request<T>(path: string, params: Params = {}): Promise<T> {
    return this.api.request<T>(path, { params });
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

  map(query: MapQuery): Promise<MapResponse> {
    return this.request('/events/map', query as Params);
  }
}
