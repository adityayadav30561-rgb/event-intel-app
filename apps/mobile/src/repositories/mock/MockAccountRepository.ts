import {
  applyTrackingChange,
  EMPTY_PREFERENCES,
  EMPTY_TRACKING,
  rankByRelevance,
  type AuthSession,
  type EventDetail,
  type EventSummary,
  type Me,
  type PlannedVisitor,
  type Preferences,
  type Role,
  type TeamMember,
  type TemporaryPassword,
  type TrackingChange,
  type TrackingSnapshot,
  type TrackingState,
} from '@eii/shared';
import { safeStorage } from '@/lib/storage';
import type { AccountRepository, EventRepository, RankedEvent } from '../types';

const PREFS_KEY = 'eii.sample.preferences';
const ME_KEY = 'eii.sample.me';
const TRACKING_KEY = 'eii.sample.tracking';
const DAY = 86_400_000;

const delay = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 250));

/**
 * Sample-data accounts, for running the app without a server: any email and password signs in
 * as a demo admin, and everything is kept on this device.
 */
export class MockAccountRepository implements AccountRepository {
  private members: TeamMember[] = [];

  constructor(private readonly events: EventRepository) {}

  private loadMe(): Me {
    const saved = safeStorage.getItem(ME_KEY);
    return saved ? (JSON.parse(saved as string) as Me) : { id: 'usr_sample', name: 'Sample User', email: 'sample@example.com', role: 'admin', mustChangePassword: false, onboarded: false };
  }

  private saveMe(me: Me): Me {
    safeStorage.setItem(ME_KEY, JSON.stringify(me));
    return me;
  }

  private session(me: Me): AuthSession {
    return { accessToken: 'sample', accessExpiresAt: new Date(Date.now() + 365 * DAY).toISOString(), refreshToken: 'sample-refresh-token-0000', user: me };
  }

  async login(email: string): Promise<AuthSession> {
    const me = this.saveMe({ ...this.loadMe(), email: email.trim().toLowerCase() || 'sample@example.com' });
    return delay(this.session(me));
  }

  async logout(): Promise<void> {}

  async changePassword(): Promise<AuthSession> {
    return delay(this.session(this.saveMe({ ...this.loadMe(), mustChangePassword: false })));
  }

  async me(): Promise<Me> {
    return delay(this.loadMe());
  }

  async completeOnboarding(): Promise<Me> {
    return delay(this.saveMe({ ...this.loadMe(), onboarded: true }));
  }

  async preferences(): Promise<Preferences> {
    const saved = safeStorage.getItem(PREFS_KEY);
    return delay(saved ? (JSON.parse(saved as string) as Preferences) : EMPTY_PREFERENCES);
  }

  async savePreferences(preferences: Preferences): Promise<Preferences> {
    safeStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
    return delay(preferences);
  }

  async forYou(limit = 10): Promise<RankedEvent[]> {
    const prefs = await this.preferences();
    const all: EventSummary[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.events.search({ limit: 50, cursor });
      all.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor && all.length < 300);
    return rankByRelevance(all, prefs).slice(0, limit);
  }

  async team(): Promise<TeamMember[]> {
    const me = this.loadMe();
    return delay([{ ...me, isActive: true, lastSignInAt: new Date().toISOString(), createdAt: new Date().toISOString() }, ...this.members]);
  }

  async addMember(input: { name: string; email: string; role: Role }): Promise<TemporaryPassword> {
    const member: TeamMember = {
      id: `usr_${this.members.length + 1}`,
      ...input,
      mustChangePassword: true,
      onboarded: false,
      isActive: true,
      lastSignInAt: null,
      createdAt: new Date().toISOString(),
    };
    this.members.push(member);
    return delay({ member, temporaryPassword: 'sample-temp-pass' });
  }

  /** The "server" copy lives on this device; the same latest-wins rules apply. */
  async syncTracking(changes: TrackingChange[]): Promise<TrackingSnapshot> {
    const saved = safeStorage.getItem(TRACKING_KEY);
    const state = changes.reduce(applyTrackingChange, saved ? (JSON.parse(saved as string) as TrackingState) : EMPTY_TRACKING);
    safeStorage.setItem(TRACKING_KEY, JSON.stringify(state));
    const ids = [...new Set([...Object.keys(state.tracking), ...Object.keys(state.notes), ...Object.keys(state.checklist)])];
    const events = (await Promise.all(ids.map((id) => this.events.get(id)))).filter((e): e is EventDetail => Boolean(e));
    return delay({
      tracking: Object.values(state.tracking),
      notes: Object.values(state.notes),
      checklist: Object.values(state.checklist).flatMap((items) => Object.values(items)),
      events,
      serverTime: new Date().toISOString(),
    });
  }

  async visitors(eventId: string): Promise<PlannedVisitor[]> {
    const saved = safeStorage.getItem(TRACKING_KEY);
    const status = saved ? (JSON.parse(saved as string) as TrackingState).tracking[eventId]?.status : null;
    const me = this.loadMe();
    return delay(status && status !== 'not_visited' ? [{ name: me.name, status, isYou: true }] : []);
  }

  async updateMember(id: string, input: { isActive?: boolean; role?: Role; resetPassword?: true }): Promise<{ member: TeamMember; temporaryPassword?: string }> {
    const member = this.members.find((m) => m.id === id);
    if (!member) throw new Error('Team member not found');
    Object.assign(member, { isActive: input.isActive ?? member.isActive, role: input.role ?? member.role });
    return delay({ member, temporaryPassword: input.resetPassword ? 'sample-temp-pass' : undefined });
  }
}
