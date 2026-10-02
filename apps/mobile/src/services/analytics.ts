/**
 * Analytics (spec §92) behind one small interface. Today: the console in development and nothing
 * in production — no data leaves the phone. A real provider can be plugged in later without
 * touching the screens. Never send notes, names, emails or anything typed into a note.
 */
export type AnalyticsEvent =
  | 'app_open'
  | 'search'
  | 'event_view'
  | 'event_save'
  | 'event_follow'
  | 'visit_status'
  | 'reminder_set'
  | 'calendar_add'
  | 'saved_search_create'
  | 'notification_open'
  | 'offline_pack_save';

type Props = Record<string, string | number | boolean | undefined>;

export interface AnalyticsProvider {
  track(event: AnalyticsEvent, props?: Props): void;
}

const consoleProvider: AnalyticsProvider = {
  track: (event, props) => console.info(`[analytics] ${event}`, props ?? {}),
};
const noopProvider: AnalyticsProvider = { track: () => {} };

let provider: AnalyticsProvider = __DEV__ ? consoleProvider : noopProvider;

export const analytics = {
  track(event: AnalyticsEvent, props?: Props) {
    try {
      provider.track(event, props);
    } catch {
      // Analytics must never break the app.
    }
  },
  /** For a future provider (e.g. privacy-friendly, self-hosted). */
  use(next: AnalyticsProvider) {
    provider = next;
  },
};
