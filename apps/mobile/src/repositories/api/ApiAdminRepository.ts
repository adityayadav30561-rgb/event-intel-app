import type { AdminCreateEvent, AdminEvent, AdminEventPatch, AdminOverview, ConflictItem, DuplicatePair, MergeChoice, ReviewItem, SyncInfo } from '@eii/shared';
import type { AdminRepository, ImportDraft } from '../types';
import type { ApiClient } from './client';

/** Admin and researcher tools on the live API (Phase 8). */
export class ApiAdminRepository implements AdminRepository {
  constructor(private readonly api: ApiClient) {}

  overview(): Promise<AdminOverview> {
    return this.api.request('/admin/overview');
  }
  async review(): Promise<ReviewItem[]> {
    return (await this.api.request<{ items: ReviewItem[] }>('/admin/review')).items;
  }
  event(id: string): Promise<AdminEvent> {
    return this.api.request(`/admin/events/${encodeURIComponent(id)}`);
  }
  edit(id: string, patch: AdminEventPatch): Promise<AdminEvent> {
    return this.api.request(`/admin/events/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
  }
  clearOverride(id: string, field: string): Promise<AdminEvent> {
    return this.api.request(`/admin/events/${encodeURIComponent(id)}/overrides/${encodeURIComponent(field)}`, { method: 'DELETE' });
  }
  async verify(id: string): Promise<void> {
    await this.api.request(`/admin/events/${encodeURIComponent(id)}/verify`, { method: 'POST', body: {} });
  }
  async reject(id: string): Promise<void> {
    await this.api.request(`/admin/events/${encodeURIComponent(id)}/reject`, { method: 'POST', body: {} });
  }
  importUrl(url: string): Promise<ImportDraft> {
    return this.api.request('/admin/import', { method: 'POST', body: { url } });
  }
  async create(input: AdminCreateEvent): Promise<string> {
    return (await this.api.request<{ id: string }>('/admin/events', { method: 'POST', body: input })).id;
  }
  async duplicates(): Promise<DuplicatePair[]> {
    return (await this.api.request<{ items: DuplicatePair[] }>('/admin/duplicates')).items;
  }
  async merge(id: string, choice: MergeChoice): Promise<string> {
    return (await this.api.request<{ id: string }>(`/admin/duplicates/${encodeURIComponent(id)}/merge`, { method: 'POST', body: choice })).id;
  }
  async dismissDuplicate(id: string): Promise<void> {
    await this.api.request(`/admin/duplicates/${encodeURIComponent(id)}/dismiss`, { method: 'POST', body: {} });
  }
  async conflicts(): Promise<ConflictItem[]> {
    return (await this.api.request<{ items: ConflictItem[] }>('/admin/conflicts')).items;
  }
  async resolveConflict(id: string, index: number): Promise<void> {
    await this.api.request(`/admin/conflicts/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: { index } });
  }
  sync(): Promise<SyncInfo> {
    return this.api.request('/admin/sync');
  }
  async runSync(): Promise<boolean> {
    try {
      return (await this.api.request<{ started: boolean }>('/admin/sync/run', { method: 'POST', body: {} })).started;
    } catch {
      return false;
    }
  }
  async setSourceEnabled(id: string, enabled: boolean | null): Promise<void> {
    await this.api.request(`/admin/sources/${encodeURIComponent(id)}`, { method: 'PATCH', body: { enabled } });
  }
}
