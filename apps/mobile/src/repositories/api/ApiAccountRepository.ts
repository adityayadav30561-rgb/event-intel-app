import type { AuthSession, Me, Preferences, Role, TeamMember, TemporaryPassword } from '@eii/shared';
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
}
