import type { AdminCreateEvent, AdminEvent, AdminEventPatch, AdminOverview, ConflictItem, DuplicatePair, MergeChoice, ReviewItem, SyncInfo, AppNotification, CalendarLinks, NotificationSettings, Reminder, AuthSession, CityCount, EventDetail, EventQuery, EventSummary, HomeFeed, HomeQuery, Me, OrganizerProfile, Page, Preferences, Relevance, Role, MapQuery, MapResponse, PlannedVisitor, SavedSearch, SavedSearchQuery, SyncStatus, TeamMember, TemporaryPassword, TrackingChange, TrackingSnapshot } from '@eii/shared';

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
  /** Pins and clusters inside a box, with the same filters as search. */
  map(query: MapQuery): Promise<MapResponse>;
}

export type RankedEvent = EventSummary & { relevance: Relevance };

/** The signed-in person's account, interests and team (Phase 4). Same split: sample or live. */
export interface AccountRepository {
  login(email: string, password: string): Promise<AuthSession>;
  /** Ends this device's session on the server; never fails (signing out works offline). */
  logout(refreshToken: string): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<AuthSession>;
  me(): Promise<Me>;
  completeOnboarding(): Promise<Me>;
  preferences(): Promise<Preferences>;
  savePreferences(preferences: Preferences): Promise<Preferences>;
  forYou(limit?: number): Promise<RankedEvent[]>;
  team(): Promise<TeamMember[]>;
  addMember(input: { name: string; email: string; role: Role }): Promise<TemporaryPassword>;
  updateMember(id: string, input: { isActive?: boolean; role?: Role; resetPassword?: true }): Promise<{ member: TeamMember; temporaryPassword?: string }>;
  /** Sends queued tracking changes (none = just refresh) and returns the server's copy. */
  syncTracking(changes: TrackingChange[]): Promise<TrackingSnapshot>;
  /** Team members planning to go to an event. */
  visitors(eventId: string): Promise<PlannedVisitor[]>;
  savedSearches(): Promise<SavedSearch[]>;
  createSavedSearch(input: { name: string; query: SavedSearchQuery; notify?: boolean }): Promise<SavedSearch>;
  updateSavedSearch(id: string, input: { name?: string; query?: SavedSearchQuery; notify?: boolean }): Promise<SavedSearch>;
  deleteSavedSearch(id: string): Promise<void>;
  pushKey(): Promise<string>;
  registerPush(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void>;
  unregisterPush(endpoint: string): Promise<void>;
  testPush(): Promise<void>;
  notificationSettings(): Promise<NotificationSettings>;
  saveNotificationSettings(settings: NotificationSettings): Promise<NotificationSettings>;
  notifications(before?: string): Promise<{ items: AppNotification[]; unread: number; nextBefore: string | null }>;
  markNotificationsRead(ids?: string[]): Promise<void>;
  reminders(): Promise<Reminder[]>;
  addReminder(eventId: string, offsetMinutes: number): Promise<Reminder[]>;
  removeReminder(id: string): Promise<void>;
  calendarLinks(eventId: string): Promise<CalendarLinks>;
}

/** What "Add by URL" found: a complete event, or a draft to finish by hand. */
export type ImportDraft =
  | { kind: 'ready'; event: EventDetail }
  | { kind: 'needs_details'; draft: { title?: string; description?: string; imageUrl?: string; sourceUrl?: string; officialUrl?: string; start?: string; end?: string; city?: string; venueName?: string; address?: string }; missing: string };

/** Admin and researcher tools (Phase 8). Live server only. */
export interface AdminRepository {
  overview(): Promise<AdminOverview>;
  review(): Promise<ReviewItem[]>;
  event(id: string): Promise<AdminEvent>;
  edit(id: string, patch: AdminEventPatch): Promise<AdminEvent>;
  clearOverride(id: string, field: string): Promise<AdminEvent>;
  verify(id: string): Promise<void>;
  reject(id: string): Promise<void>;
  importUrl(url: string): Promise<ImportDraft>;
  create(input: AdminCreateEvent): Promise<string>;
  duplicates(): Promise<DuplicatePair[]>;
  merge(id: string, choice: MergeChoice): Promise<string>;
  dismissDuplicate(id: string): Promise<void>;
  conflicts(): Promise<ConflictItem[]>;
  resolveConflict(id: string, index: number): Promise<void>;
  sync(): Promise<SyncInfo>;
  runSync(): Promise<boolean>;
  setSourceEnabled(id: string, enabled: boolean | null): Promise<void>;
  /** The team's data as one JSON file (admins only). */
  backup(): Promise<{ createdAt: string }>;
}
