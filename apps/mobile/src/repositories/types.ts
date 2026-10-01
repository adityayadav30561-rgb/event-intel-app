import type { AuthSession, CityCount, EventDetail, EventQuery, EventSummary, HomeFeed, HomeQuery, Me, OrganizerProfile, Page, Preferences, Relevance, Role, SyncStatus, TeamMember, TemporaryPassword } from '@eii/shared';

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
}
