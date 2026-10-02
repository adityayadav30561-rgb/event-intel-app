import { z } from 'zod';
import type { EventSummary } from '../domain/types';

/** Alerts (Phase 7, docs/DEVELOPMENT_PLAN.md §10.4). Only these types exist; nothing promotional. */
export const NOTIFICATION_TYPES = ['change', 'saved_search', 'interests', 'reminder', 'starts_tomorrow'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, { title: string; detail: string }> = {
  change: { title: 'Event Changes', detail: 'Date, venue, registration or status changes to events you follow' },
  saved_search: { title: 'Saved Search Matches', detail: 'New events that match a saved search' },
  interests: { title: 'New Matches for You', detail: 'One summary when new events match your interests' },
  reminder: { title: 'Reminders', detail: 'The reminders you set on events' },
  starts_tomorrow: { title: 'Starts Tomorrow', detail: 'The evening before an event you saved or plan to visit' },
};

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Where tapping it goes, e.g. "/event/evt_123". */
  url: string;
  eventId: string | null;
  critical: boolean;
  createdAt: string;
  readAt: string | null;
};

export type NotificationSettings = {
  types: Record<NotificationType, boolean>;
  /** Minutes after midnight, India time. Non-critical alerts wait in the inbox during these hours. */
  quietStart: number;
  quietEnd: number;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  types: { change: true, saved_search: true, interests: true, reminder: true, starts_tomorrow: true },
  quietStart: 21 * 60,
  quietEnd: 8 * 60,
};

const minutes = z.number().int().min(0).max(24 * 60 - 1);
export const notificationSettingsSchema = z.object({
  types: z.object(Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, z.boolean()])) as Record<NotificationType, z.ZodBoolean>),
  quietStart: minutes,
  quietEnd: minutes,
});

/** A device's Web Push subscription (PushSubscription.toJSON()). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export const REMINDER_OFFSETS = [
  { minutes: 7 * 24 * 60, label: '1 week before' },
  { minutes: 3 * 24 * 60, label: '3 days before' },
  { minutes: 24 * 60, label: '1 day before' },
  { minutes: 2 * 60, label: '2 hours before' },
] as const;

export const reminderSchema = z.object({ eventId: z.string().min(1).max(120), offsetMinutes: z.number().int().min(0).max(43_200) });

export type Reminder = {
  id: string;
  eventId: string;
  offsetMinutes: number;
  /** When it goes off (the event's start minus the offset). */
  remindAt: string;
  sentAt: string | null;
  event: EventSummary;
};

/** "Add to calendar": a file the phone opens, and Google Calendar as an alternative. */
export type CalendarLinks = { icsUrl: string; googleUrl: string };

export const reminderLabel = (offsetMinutes: number) =>
  REMINDER_OFFSETS.find((o) => o.minutes === offsetMinutes)?.label ??
  (offsetMinutes % 1440 === 0 ? `${offsetMinutes / 1440} days before` : `${Math.round(offsetMinutes / 60)} hours before`);
