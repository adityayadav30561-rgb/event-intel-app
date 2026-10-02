import { Ionicons } from '@expo/vector-icons';
import {
  CITIES,
  EVENT_STATUSES,
  EVENT_TYPE_LABELS,
  getCity,
  istParts,
  normalizeText,
  OVERRIDE_LABELS,
  STATUS_LABELS,
  type AdminCreateEvent,
  type AdminEventPatch,
  type AttendanceMode,
  type EventDetail,
  type EventStatus,
  type EventType,
} from '@eii/shared';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { EventTypeSheet } from '@/components/pickers/FilterSheets';
import { OptionList } from '@/components/pickers/OptionList';
import { ListGroup, SearchField, SegmentedControl, Sheet, Text, Toggle } from '@/components/ui';
import { spacing, typography, useTheme } from '@/theme';

/** The form's own values: dates and times as typed, in India time. */
export type EventFormState = {
  title: string;
  eventType: EventType;
  status: EventStatus;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  cityId: string;
  venueName: string;
  venueAddress: string;
  attendanceMode: AttendanceMode;
  price: 'unknown' | 'free' | 'paid';
  priceAmount: string;
  registrationUrl: string;
  officialWebsite: string;
  description: string;
};

const pad = (n: number) => String(n).padStart(2, '0');
const istDate = (iso: string) => {
  const p = istParts(new Date(iso));
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};
const istTime = (iso: string) => {
  const p = istParts(new Date(iso));
  return `${pad(p.hour)}:${pad(p.minute)}`;
};

export const EMPTY_FORM: EventFormState = {
  title: '',
  eventType: 'conference',
  status: 'upcoming',
  startDate: '',
  startTime: '09:30',
  endDate: '',
  endTime: '17:30',
  allDay: false,
  cityId: '',
  venueName: '',
  venueAddress: '',
  attendanceMode: 'in_person',
  price: 'unknown',
  priceAmount: '',
  registrationUrl: '',
  officialWebsite: '',
  description: '',
};

export function formFromEvent(e: EventDetail): EventFormState {
  return {
    title: e.title,
    eventType: e.eventType,
    status: e.status,
    startDate: istDate(e.startAt),
    startTime: istTime(e.startAt),
    endDate: istDate(e.endAt),
    endTime: istTime(e.endAt),
    allDay: e.allDay,
    cityId: e.cityId,
    venueName: e.venueName ?? '',
    venueAddress: e.venue?.address ?? '',
    attendanceMode: e.attendanceMode,
    price: e.price?.min === 0 ? 'free' : e.price?.min ? 'paid' : 'unknown',
    priceAmount: e.price?.min ? String(e.price.min) : '',
    registrationUrl: e.registrationUrl ?? '',
    officialWebsite: e.officialWebsite ?? '',
    description: e.description ?? '',
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const URL_RE = /^https?:\/\/\S+\.\S+/i;

/** The instants the form stands for, or an error to show. */
function times(f: EventFormState): { startAt: string; endAt: string } | { error: string } {
  if (!DATE.test(f.startDate) || !DATE.test(f.endDate)) return { error: 'Dates look like 2026-11-12.' };
  if (!f.allDay && (!TIME.test(f.startTime) || !TIME.test(f.endTime))) return { error: 'Times look like 09:30 (24-hour, India time).' };
  const startAt = new Date(`${f.startDate}T${f.allDay ? '00:00' : f.startTime}:00+05:30`);
  const endAt = new Date(`${f.endDate}T${f.allDay ? '23:59' : f.endTime}:00+05:30`);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return { error: 'That date doesn’t exist.' };
  if (endAt < startAt) return { error: 'The end must be after the start.' };
  return { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
}

/** Checks the form; returns a message for the first problem. */
export function validateForm(f: EventFormState): string | undefined {
  if (f.title.trim().length < 3) return 'Add a title.';
  const t = times(f);
  if ('error' in t) return t.error;
  if (!f.cityId) return 'Choose a city.';
  if (f.registrationUrl && !URL_RE.test(f.registrationUrl)) return 'The registration link should start with https://';
  if (f.officialWebsite && !URL_RE.test(f.officialWebsite)) return 'The website should start with https://';
  if (f.price === 'paid' && !(Number(f.priceAmount) > 0)) return 'Enter the lowest ticket price in rupees.';
  return undefined;
}

const priceValue = (f: EventFormState) => (f.price === 'free' ? 0 : f.price === 'paid' ? Number(f.priceAmount) : null);
const orNull = (s: string) => (s.trim() ? s.trim() : null);

/** Only what changed, for an edit. */
export function formPatch(before: EventFormState, after: EventFormState): AdminEventPatch {
  const patch: AdminEventPatch = {};
  if (after.title.trim() !== before.title) patch.title = after.title.trim();
  if (after.eventType !== before.eventType) patch.eventType = after.eventType;
  if (after.status !== before.status) patch.status = after.status;
  const timesChanged = (['startDate', 'startTime', 'endDate', 'endTime', 'allDay'] as const).some((k) => after[k] !== before[k]);
  const t = times(after);
  if (timesChanged && !('error' in t)) Object.assign(patch, { startAt: t.startAt, endAt: t.endAt, allDay: after.allDay });
  if (after.cityId !== before.cityId) patch.cityId = after.cityId;
  if (after.venueName.trim() !== before.venueName || after.venueAddress.trim() !== before.venueAddress) {
    Object.assign(patch, { venueName: orNull(after.venueName), venueAddress: orNull(after.venueAddress) });
  }
  if (after.attendanceMode !== before.attendanceMode) patch.attendanceMode = after.attendanceMode;
  if (after.price !== before.price || after.priceAmount !== before.priceAmount) patch.priceMin = priceValue(after);
  if (after.registrationUrl.trim() !== before.registrationUrl) patch.registrationUrl = orNull(after.registrationUrl);
  if (after.officialWebsite.trim() !== before.officialWebsite) patch.officialWebsite = orNull(after.officialWebsite);
  if (after.description.trim() !== before.description) patch.description = orNull(after.description);
  return patch;
}

/** Everything, for a new event. */
export function formToCreate(f: EventFormState, extra: { sourceUrl?: string; imageUrl?: string } = {}): AdminCreateEvent {
  const t = times(f) as { startAt: string; endAt: string };
  return {
    title: f.title.trim(),
    eventType: f.eventType,
    status: f.status,
    startAt: t.startAt,
    endAt: t.endAt,
    allDay: f.allDay,
    cityId: f.cityId,
    venueName: orNull(f.venueName),
    venueAddress: orNull(f.venueAddress),
    attendanceMode: f.attendanceMode,
    priceMin: priceValue(f),
    registrationUrl: orNull(f.registrationUrl),
    officialWebsite: orNull(f.officialWebsite),
    description: orNull(f.description),
    ...extra,
  };
}

/** Form field → the protected field it belongs to (for the "edited" marker). */
const OVERRIDE_OF: Partial<Record<keyof EventFormState, string>> = {
  title: 'title',
  eventType: 'eventType',
  status: 'status',
  startDate: 'startAt',
  endDate: 'endAt',
  cityId: 'city',
  venueName: 'venue',
  registrationUrl: 'registrationUrl',
  officialWebsite: 'officialWebsite',
  price: 'price',
  description: 'description',
};

/** A labelled row (label left, value right), as in iOS Contacts. */
function Row({ label, edited, children }: { label: string; edited?: boolean; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.label}>
        <Text variant="subheadline" tone="secondary" numberOfLines={1}>
          {label}
        </Text>
        {edited ? <Ionicons name="lock-closed" size={11} color={colors.orange} accessibilityLabel="Edited by the team" /> : null}
      </View>
      <View style={styles.value}>{children}</View>
    </View>
  );
}

function Input({ value, onChange, placeholder, keyboard, multiline }: { value: string; onChange: (v: string) => void; placeholder?: string; keyboard?: 'url' | 'numeric' | 'date'; multiline?: boolean }) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.tertiaryLabel}
      autoCapitalize={keyboard ? 'none' : 'sentences'}
      autoCorrect={!keyboard}
      keyboardType={keyboard === 'url' ? 'url' : keyboard === 'numeric' ? 'number-pad' : keyboard === 'date' ? 'numbers-and-punctuation' : 'default'}
      inputMode={keyboard === 'url' ? 'url' : keyboard === 'numeric' ? 'numeric' : 'text'}
      multiline={multiline}
      style={[typography.body, styles.input, multiline && styles.multiline, { color: colors.label }]}
    />
  );
}

function Choice({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.choice} hitSlop={6}>
      <Text variant="body" numberOfLines={1} style={styles.flex}>
        {label}
      </Text>
      <Ionicons name="chevron-expand" size={16} color={colors.tertiaryLabel} />
    </Pressable>
  );
}

/** Event fields for editing or adding (admin tools). Times are India time. */
export function EventForm({ value, onChange, overrides = [] }: { value: EventFormState; onChange: (next: EventFormState) => void; overrides?: string[] }) {
  const [sheet, setSheet] = useState<'type' | 'status' | 'city' | null>(null);
  const [cityQuery, setCityQuery] = useState('');
  const set = <K extends keyof EventFormState>(key: K, v: EventFormState[K]) => onChange({ ...value, [key]: v });
  const edited = (key: keyof EventFormState) => Boolean(OVERRIDE_OF[key] && overrides.includes(OVERRIDE_OF[key]!));
  const cities = useMemo(() => {
    const q = normalizeText(cityQuery);
    return CITIES.filter((c) => !q || [c.name, ...(c.aliases ?? [])].some((n) => normalizeText(n).includes(q))).sort((a, b) => a.name.localeCompare(b.name));
  }, [cityQuery]);

  return (
    <View style={styles.form}>
      <ListGroup separatorInset={spacing.lg}>
        <Row label="Title" edited={edited('title')}>
          <Input value={value.title} onChange={(v) => set('title', v)} placeholder="Event name" />
        </Row>
        <Row label="Type" edited={edited('eventType')}>
          <Choice label={EVENT_TYPE_LABELS[value.eventType]} onPress={() => setSheet('type')} />
        </Row>
        <Row label="Status" edited={edited('status')}>
          <Choice label={STATUS_LABELS[value.status]} onPress={() => setSheet('status')} />
        </Row>
      </ListGroup>

      <ListGroup separatorInset={spacing.lg} footer="Dates as 2026-11-12, times as 09:30, India time.">
        <Row label="All Day">
          <View style={styles.toggleCell}>
            <Toggle value={value.allDay} onValueChange={(v) => set('allDay', v)} accessibilityLabel="All day" />
          </View>
        </Row>
        <Row label="Starts" edited={edited('startDate')}>
          <View style={styles.dateTime}>
            <Input value={value.startDate} onChange={(v) => set('startDate', v)} placeholder="YYYY-MM-DD" keyboard="date" />
            {value.allDay ? null : <Input value={value.startTime} onChange={(v) => set('startTime', v)} placeholder="HH:MM" keyboard="date" />}
          </View>
        </Row>
        <Row label="Ends" edited={edited('endDate')}>
          <View style={styles.dateTime}>
            <Input value={value.endDate} onChange={(v) => set('endDate', v)} placeholder="YYYY-MM-DD" keyboard="date" />
            {value.allDay ? null : <Input value={value.endTime} onChange={(v) => set('endTime', v)} placeholder="HH:MM" keyboard="date" />}
          </View>
        </Row>
      </ListGroup>

      <ListGroup separatorInset={spacing.lg}>
        <Row label="City" edited={edited('cityId')}>
          <Choice label={getCity(value.cityId)?.name ?? (value.cityId || 'Choose')} onPress={() => setSheet('city')} />
        </Row>
        <Row label="Venue" edited={edited('venueName')}>
          <Input value={value.venueName} onChange={(v) => set('venueName', v)} placeholder="Venue name" />
        </Row>
        <Row label="Address">
          <Input value={value.venueAddress} onChange={(v) => set('venueAddress', v)} placeholder="Street, area" />
        </Row>
      </ListGroup>

      <View style={styles.segmented}>
        <SegmentedControl
          segments={[
            { value: 'in_person', label: 'In Person' },
            { value: 'online', label: 'Online' },
            { value: 'hybrid', label: 'Hybrid' },
          ]}
          value={value.attendanceMode}
          onChange={(v) => set('attendanceMode', v)}
        />
        <SegmentedControl
          segments={[
            { value: 'unknown', label: 'Price Unknown' },
            { value: 'free', label: 'Free' },
            { value: 'paid', label: 'Paid' },
          ]}
          value={value.price}
          onChange={(v) => set('price', v)}
        />
      </View>

      <ListGroup separatorInset={spacing.lg}>
        {value.price === 'paid' ? (
          <Row label="From ₹" edited={edited('price')}>
            <Input value={value.priceAmount} onChange={(v) => set('priceAmount', v.replace(/[^\d]/g, ''))} placeholder="Lowest ticket" keyboard="numeric" />
          </Row>
        ) : null}
        <Row label="Register" edited={edited('registrationUrl')}>
          <Input value={value.registrationUrl} onChange={(v) => set('registrationUrl', v)} placeholder="https://" keyboard="url" />
        </Row>
        <Row label="Website" edited={edited('officialWebsite')}>
          <Input value={value.officialWebsite} onChange={(v) => set('officialWebsite', v)} placeholder="https://" keyboard="url" />
        </Row>
      </ListGroup>

      <ListGroup separatorInset={spacing.lg}>
        <Row label="About" edited={edited('description')}>
          <Input value={value.description} onChange={(v) => set('description', v)} placeholder="What the event is about" multiline />
        </Row>
      </ListGroup>

      <EventTypeSheet visible={sheet === 'type'} onClose={() => setSheet(null)} value={value.eventType} onChange={(t) => t && set('eventType', t)} />
      <Sheet visible={sheet === 'status'} onClose={() => setSheet(null)} title="Status">
        <OptionList
          groups={[{ options: EVENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })) }]}
          selected={value.status}
          onSelect={(s) => {
            set('status', s);
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet visible={sheet === 'city'} onClose={() => setSheet(null)} title="City" scroll>
        <View style={styles.search}>
          <SearchField value={cityQuery} onChangeText={setCityQuery} onClear={() => setCityQuery('')} placeholder="Search cities" />
        </View>
        <OptionList
          groups={[{ options: cities.map((c) => ({ value: c.id, label: c.name, detail: c.state })) }]}
          selected={value.cityId}
          onSelect={(id) => {
            set('cityId', id);
            setCityQuery('');
            setSheet(null);
          }}
        />
      </Sheet>
    </View>
  );
}

/** Lists the protected fields with a way to let syncs update each again. */
export function OverrideList({ overrides, onClear }: { overrides: { field: string; editedBy: string | null; editedAt: string }[]; onClear: (field: string) => void }) {
  const { colors } = useTheme();
  if (!overrides.length) return null;
  return (
    <ListGroup header="Kept as Edited" footer="Syncs won’t change these fields. Tap to let the sources update one again." separatorInset={spacing.lg}>
      {overrides.map((o) => (
        <Pressable key={o.field} onPress={() => onClear(o.field)} accessibilityRole="button" style={styles.overrideRow}>
          <Ionicons name="lock-closed" size={14} color={colors.orange} />
          <Text variant="body" style={styles.flex}>
            {OVERRIDE_LABELS[o.field] ?? o.field}
          </Text>
          <Text variant="footnote" tone="secondary">
            {o.editedBy ?? 'Team'}
          </Text>
          <Text variant="subheadline" tone="tint">
            Unlock
          </Text>
        </Pressable>
      ))}
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: spacing.lg, gap: spacing.md },
  label: { width: 84, flexDirection: 'row', alignItems: 'center', gap: 4 },
  value: { flex: 1, minWidth: 0 },
  input: { paddingVertical: 12, minWidth: 0, flex: 1, outlineStyle: 'none' } as object,
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12 },
  dateTime: { flexDirection: 'row', gap: spacing.md },
  toggleCell: { alignItems: 'flex-end', paddingVertical: 8 },
  segmented: { gap: spacing.md },
  search: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  overrideRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.lg },
  flex: { flex: 1, minWidth: 0 },
});
