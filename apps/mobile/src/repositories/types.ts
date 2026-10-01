import type { CityCount, EventDetail, EventQuery, EventSummary, HomeFeed, HomeQuery, OrganizerProfile, Page, SyncStatus } from '@eii/shared';

/**
 * Everything the app needs from an event data source. Screens never see which implementation
 * is active: the sample-data repository or the live API (spec §149).
 */
export interface EventRepository {
  home(query: HomeQuery): Promise<HomeFeed>;
  search(query: EventQuery): Promise<Page<EventSummary>>;
  /** Resolves to null when the event does not exist or is not visible. */
  get(id: string): Promise<EventDetail | null>;
  related(id: string): Promise<EventSummary[]>;
  organizer(id: string): Promise<OrganizerProfile | null>;
  cityCounts(): Promise<CityCount[]>;
  syncStatus(): Promise<SyncStatus>;
}
