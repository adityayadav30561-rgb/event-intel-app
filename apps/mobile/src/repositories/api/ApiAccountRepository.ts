import type { AppNotification, CalendarLinks, NotificationSettings, Reminder, AuthSession, Me, PlannedVisitor, SavedSearch, SavedSearchQuery, Preferences, Role, TeamMember, TemporaryPassword, TrackingChange, TrackingSnapshot } from '@eii/shared';
import type { AccountRepository, RankedEvent } from '../types';
import type { ApiClient } from './client';

/** Accounts on the Event Intelligence API (docs/DEVELOPMENT_PLAN.md §7, Phase 4). */
export class ApiAccountRepository implements AccountRepository {
  constructor(private readonly api: ApiClient) {}

  login(email: string, password: string): Promise<AuthSession> {
    return this.api.request('/auth/login', { method: 'POST', auth: false, body: { email, password } });
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      await this.api.request('/auth/logout', { method: 'POST', auth: false, body: { refreshToken } });
    } catch {
      // Offline or already ended: the device forgets the session either way.
    }
  }

  changePassword(currentPassword: string, newPassword: string): Promise<AuthSession> {
    return this.api.request('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
  }

  me(): Promise<Me> {
    return this.api.request('/me');
  }

  completeOnboarding(): Promise<Me> {
    return this.api.request('/me', { method: 'PATCH', body: { onboarded: true } });
  }

  preferences(): Promise<Preferences> {
    return this.api.request('/me/preferences');
  }

  savePreferences(preferences: Preferences): Promise<Preferences> {
    return this.api.request('/me/preferences', { method: 'PUT', body: preferences });
  }

  async forYou(limit = 10): Promise<RankedEvent[]> {
    return (await this.api.request<{ items: RankedEvent[] }>('/me/for-you', { params: { limit } })).items;
  }

  async team(): Promise<TeamMember[]> {
    return (await this.api.request<{ items: TeamMember[] }>('/admin/users')).items;
  }

  addMember(input: { name: string; email: string; role: Role }): Promise<TemporaryPassword> {
    return this.api.request('/admin/users', { method: 'POST', body: input });
  }

  updateMember(id: string, input: { isActive?: boolean; role?: Role; resetPassword?: true }): Promise<{ member: TeamMember; temporaryPassword?: string }> {
    return this.api.request(`/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: input });
  }

  syncTracking(changes: TrackingChange[]): Promise<TrackingSnapshot> {
    return this.api.request('/me/sync', { method: 'POST', body: { changes } });
  }

  async savedSearches(): Promise<SavedSearch[]> {
    return (await this.api.request<{ items: SavedSearch[] }>('/me/saved-searches')).items;
  }

  createSavedSearch(input: { name: string; query: SavedSearchQuery; notify?: boolean }): Promise<SavedSearch> {
    return this.api.request('/me/saved-searches', { method: 'POST', body: input });
  }

  updateSavedSearch(id: string, input: { name?: string; query?: SavedSearchQuery; notify?: boolean }): Promise<SavedSearch> {
    return this.api.request(`/me/saved-searches/${encodeURIComponent(id)}`, { method: 'PATCH', body: input });
  }

  async deleteSavedSearch(id: string): Promise<void> {
    await this.api.request(`/me/saved-searches/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async pushKey(): Promise<string> {
    return (await this.api.request<{ publicKey: string }>('/push/key')).publicKey;
  }

  async registerPush(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
    await this.api.request('/me/push-subscriptions', { method: 'POST', body: subscription });
  }

  async unregisterPush(endpoint: string): Promise<void> {
    await this.api.request('/me/push-subscriptions/remove', { method: 'POST', body: { endpoint } });
  }

  async testPush(): Promise<void> {
    await this.api.request('/me/push-test', { method: 'POST', body: {} });
  }

  notificationSettings(): Promise<NotificationSettings> {
    return this.api.request('/me/notification-settings');
  }

  saveNotificationSettings(settings: NotificationSettings): Promise<NotificationSettings> {
    return this.api.request('/me/notification-settings', { method: 'PUT', body: settings });
  }

  notifications(before?: string): Promise<{ items: AppNotification[]; unread: number; nextBefore: string | null }> {
    return this.api.request('/me/notifications', { params: { before } });
  }

  async markNotificationsRead(ids?: string[]): Promise<void> {
    await this.api.request('/me/notifications/read', { method: 'POST', body: ids ? { ids } : {} });
  }

  async reminders(): Promise<Reminder[]> {
    return (await this.api.request<{ items: Reminder[] }>('/me/reminders')).items;
  }

  async addReminder(eventId: string, offsetMinutes: number): Promise<Reminder[]> {
    return (await this.api.request<{ items: Reminder[] }>('/me/reminders', { method: 'POST', body: { eventId, offsetMinutes } })).items;
  }

  async removeReminder(id: string): Promise<void> {
    await this.api.request(`/me/reminders/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  calendarLinks(eventId: string): Promise<CalendarLinks> {
    return this.api.request(`/events/${encodeURIComponent(eventId)}/calendar`);
  }

  async visitors(eventId: string): Promise<PlannedVisitor[]> {
    return (await this.api.request<{ items: PlannedVisitor[] }>(`/events/${encodeURIComponent(eventId)}/visitors`)).items;
  }
}
