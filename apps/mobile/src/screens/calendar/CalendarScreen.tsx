import { Ionicons } from '@expo/vector-icons';
import { formatLongDate, isTracked, istMidnight, istParts, istStartOfDay, type EventSummary } from '@eii/shared';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CompactEventRow } from '@/components/event';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { PlaceButton } from '@/components/pickers/PlaceButton';
import { PlaceSheet } from '@/components/pickers/PlaceSheet';
import { EmptyState, ErrorState, ListGroup, SegmentedControl, Skeleton, Text } from '@/components/ui';
import { useEventSearch } from '@/hooks/useEvents';
import { useNow } from '@/hooks/useNow';
import { placeCityIds, placeName, usePlaceStore } from '@/store/placeStore';
import { useTrackingStore } from '@/store/trackingStore';
import { radius, spacing, useTheme } from '@/theme';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Month = { year: number; month: number };
const dayKey = (d: Date) => {
  const p = istParts(d);
  return `${p.year}-${p.month}-${p.day}`;
};

/** Every India-time day an event covers (multi-day events mark each day). */
function daysOf(e: EventSummary, from: Date, to: Date): string[] {
  const keys: string[] = [];
  let d = istStartOfDay(new Date(Math.max(new Date(e.startAt).getTime(), from.getTime())));
  const end = Math.min(new Date(e.endAt).getTime(), to.getTime() - 1);
  for (let i = 0; i < 62 && d.getTime() <= end; i++, d = istStartOfDay(d, 1)) keys.push(dayKey(d));
  return keys;
}

/** My tracked events, from this phone (works offline). */
function useMyCalendarEvents(): EventSummary[] {
  const view = useTrackingStore((s) => s.view);
  const events = useTrackingStore((s) => s.events);
  return useMemo(
    () =>
      Object.values(view.tracking)
        .filter((t) => isTracked(t) && t.status !== 'not_visited')
        .map((t) => events[t.eventId])
        .filter((e): e is EventSummary => Boolean(e) && e!.status !== 'cancelled'),
    [view, events],
  );
}

/** Calendar (§52–53): a month at a glance; your events, or everything coming up. */
export function CalendarScreen() {
  const { colors } = useTheme();
  const now = useNow();
  const place = usePlaceStore((s) => s.place);
  const setPlace = usePlaceStore((s) => s.setPlace);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [month, setMonth] = useState<Month>(() => {
    const p = istParts(new Date());
    return { year: p.year, month: p.month };
  });
  const [selected, setSelected] = useState<string | null>(() => dayKey(new Date()));

  const from = istMidnight(month.year, month.month, 1);
  const to = istMidnight(month.year, month.month + 1, 1);
  const query = useMemo(
    () => ({ from: from.toISOString(), to: to.toISOString(), cityIds: placeCityIds(place), sort: 'date' as const, limit: 50, includePast: true }),
    // from/to are derived from month.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [month, place],
  );
  const all = useEventSearch(query, scope === 'all');
  useEffect(() => {
    if (scope === 'all' && all.hasNextPage && !all.isFetchingNextPage) void all.fetchNextPage();
  }, [scope, all]);
  const mine = useMyCalendarEvents();

  const events = useMemo(() => {
    const list = scope === 'mine' ? mine : (all.data?.pages.flatMap((p) => p.items) ?? []).filter((e) => e.status !== 'cancelled');
    return list.filter((e) => new Date(e.startAt) < to && new Date(e.endAt) >= from);
    // from/to are derived from month.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, mine, all.data, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, EventSummary[]>();
    for (const e of events) for (const k of daysOf(e, from, to)) map.set(k, [...(map.get(k) ?? []), e]);
    for (const list of map.values()) list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return map;
    // from/to are derived from month.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, month]);

  // The grid: Monday-first weeks covering the month.
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(month.year, month.month - 1, 1)).getUTCDay();
    const lead = (first + 6) % 7;
    const days = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
    return [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [month]);

  const todayKey = dayKey(new Date(now));
  const shift = (delta: number) => {
    setMonth((m) => {
      const d = new Date(Date.UTC(m.year, m.month - 1 + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
    });
    setSelected(null);
  };

  const selectedEvents = selected ? (byDay.get(selected) ?? []) : [];
  const monthList = [...byDay.entries()]
    .map(([k, list]) => ({ k, list, at: istMidnight(Number(k.split('-')[0]), Number(k.split('-')[1]), Number(k.split('-')[2])) }))
    .filter((d) => d.at.getTime() >= istStartOfDay(new Date(now)).getTime() || month.month !== istParts(new Date(now)).month)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const loading = scope === 'all' && all.isPending;

  return (
    <>
      <LargeTitleScrollView
        title="Calendar"
        tabRoot
        headerRight={scope === 'all' ? <PlaceButton label={placeName(place)} onPress={() => setPlaceOpen(true)} /> : undefined}
        accessory={
          <SegmentedControl
            segments={[
              { value: 'mine', label: 'My Events' },
              { value: 'all', label: 'All Events' },
            ]}
            value={scope}
            onChange={setScope}
          />
        }
      >
        <View style={styles.body}>
          <View style={[styles.month, { backgroundColor: colors.surface }]}>
            <View style={styles.monthHeader}>
              <Text variant="title3" accessibilityRole="header">
                {MONTHS[month.month - 1]} {month.year}
              </Text>
              <View style={styles.arrows}>
                <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month">
                  <Ionicons name="chevron-back" size={22} color={colors.tint} />
                </Pressable>
                <Pressable onPress={() => shift(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month">
                  <Ionicons name="chevron-forward" size={22} color={colors.tint} />
                </Pressable>
              </View>
            </View>
            <View style={styles.week}>
              {WEEKDAYS.map((d, i) => (
                <Text key={i} variant="caption2Strong" tone="tertiary" style={styles.weekday}>
                  {d}
                </Text>
              ))}
            </View>
            <View style={styles.grid}>
              {cells.map((day, i) => {
                if (day === null) return <View key={`e${i}`} style={styles.cell} />;
                const key = `${month.year}-${month.month}-${day}`;
                const count = byDay.get(key)?.length ?? 0;
                const isToday = key === todayKey;
                const isSelected = key === selected;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setSelected(isSelected ? null : key)}
                    accessibilityRole="button"
                    accessibilityLabel={`${day} ${MONTHS[month.month - 1]}${count ? `, ${count} ${count === 1 ? 'event' : 'events'}` : ''}`}
                    accessibilityState={{ selected: isSelected }}
                    style={styles.cell}
                  >
                    <View style={[styles.dayCircle, isSelected && { backgroundColor: isToday ? colors.red : colors.label }]}>
                      <Text variant={isToday || isSelected ? 'headline' : 'body'} style={{ color: isSelected ? colors.background : isToday ? colors.red : colors.label }}>
                        {day}
                      </Text>
                    </View>
                    <View style={[styles.dot, { backgroundColor: count ? (scope === 'mine' ? colors.tint : colors.secondaryLabel) : 'transparent' }]} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          {loading ? (
            <Skeleton height={120} round={radius.lg} />
          ) : scope === 'all' && all.isError && !all.data ? (
            <ErrorState onRetry={() => all.refetch()} />
          ) : selected ? (
            <View style={styles.section}>
              <Text variant="headline" style={styles.dayTitle}>
                {formatLongDate(istMidnight(Number(selected.split('-')[0]), Number(selected.split('-')[1]), Number(selected.split('-')[2])))}
              </Text>
              {selectedEvents.length ? (
                <ListGroup separatorInset={78}>
                  {selectedEvents.map((e) => (
                    <CompactEventRow key={e.id} event={e} />
                  ))}
                </ListGroup>
              ) : (
                <Text variant="subheadline" tone="secondary" style={styles.dayTitle}>
                  {scope === 'mine' ? 'Nothing you’re tracking on this day.' : 'No events on this day.'}
                </Text>
              )}
            </View>
          ) : monthList.length ? (
            monthList.map(({ k, list, at }) => (
              <View key={k} style={styles.section}>
                <Text variant="headline" style={styles.dayTitle}>
                  {formatLongDate(at)}
                </Text>
                <ListGroup separatorInset={78}>
                  {list.map((e) => (
                    <CompactEventRow key={e.id} event={e} />
                  ))}
                </ListGroup>
              </View>
            ))
          ) : (
            <EmptyState
              icon="calendar-clear-outline"
              title={scope === 'mine' ? 'Nothing Planned This Month' : 'No Events This Month'}
              message={scope === 'mine' ? 'Events you save, follow or plan to visit appear here.' : 'Try another month or location.'}
            />
          )}
        </View>
      </LargeTitleScrollView>
      <PlaceSheet visible={placeOpen} onClose={() => setPlaceOpen(false)} value={place} onChange={(p) => p && setPlace(p)} />
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.xl, paddingTop: spacing.sm },
  month: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  arrows: { flexDirection: 'row', gap: spacing.xl },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3, gap: 2 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },
  section: { gap: spacing.sm },
  dayTitle: { paddingHorizontal: spacing.xs },
});
