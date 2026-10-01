import type { AttendanceMode, ChangeField, EventChange, EventStatus, Price } from './domain/types';

/** Display text shared by every client, so wording stays consistent. */

export const STATUS_LABELS: Record<EventStatus, string> = {
  upcoming: 'Upcoming',
  ongoing: 'Happening Now',
  completed: 'Completed',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
  rescheduled: 'Rescheduled',
  registration_closed: 'Registration Closed',
};

export const ATTENDANCE_LABELS: Record<AttendanceMode, string> = {
  in_person: 'In person',
  online: 'Online',
  hybrid: 'In person and online',
};

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** "Free" · "₹4,999" · "₹1,999 – ₹4,999" · "Contact organizer" · undefined when unknown. */
export function formatPrice(price: Price | undefined): string | undefined {
  if (!price) return undefined;
  if (price.min === 0 && !price.max) return 'Free';
  if (price.min !== undefined && price.max !== undefined && price.max > price.min) {
    return `${rupees.format(price.min)} – ${rupees.format(price.max)}`;
  }
  if (price.min !== undefined) return `From ${rupees.format(price.min)}`;
  return price.note;
}

export const CHANGE_LABELS: Record<ChangeField, string> = {
  date: 'Dates changed',
  time: 'Timings changed',
  venue: 'Venue changed',
  organizer: 'Organizer changed',
  registration: 'Registration updated',
  price: 'Price changed',
  status: 'Status changed',
  speakers: 'Speakers updated',
  exhibitors: 'Exhibitors updated',
  agenda: 'Agenda updated',
};

/** Short description of a change, e.g. "Postponed" for a status change. */
export function describeChange(change: Pick<EventChange, 'field' | 'current'>): string {
  if (change.field === 'status' && change.current) return change.current;
  if (change.field === 'registration' && change.current === 'Closed') return 'Registration closed';
  return CHANGE_LABELS[change.field];
}
