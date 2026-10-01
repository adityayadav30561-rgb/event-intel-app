import { EVENT_TYPE_LABELS, formatDateRange, topicNames, type EventSummary } from '@eii/shared';
import { router } from 'expo-router';

export const startOf = (event: EventSummary) => new Date(event.startAt);
export const endOf = (event: EventSummary) => new Date(event.endAt);

/** "18–20 Oct · Hyderabad" (online events show "Online"). */
export function whenWhere(event: EventSummary, withYear = false): string {
  const place = event.attendanceMode === 'online' ? 'Online' : event.city;
  // "12 km away" when you searched near your location.
  const distance = event.distanceKm !== undefined ? ` · ${event.distanceKm < 1 ? 'Under 1' : Math.round(event.distanceKm)} km away` : '';
  return `${formatDateRange(startOf(event), endOf(event), withYear)} · ${place}${distance}`;
}

/** "Conference · SAP, ERP" */
export function typeAndTopics(event: EventSummary, max = 2): string {
  const topics = topicNames(event, max);
  return [EVENT_TYPE_LABELS[event.eventType], topics.join(', ')].filter(Boolean).join(' · ');
}

export function openEvent(id: string) {
  router.push(`/event/${id}`);
}
