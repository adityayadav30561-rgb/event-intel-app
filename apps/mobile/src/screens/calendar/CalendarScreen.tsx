import { formatLongDate, istDayDiff, istStartOfDay, type EventSummary } from '@eii/shared';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CompactEventRow } from '@/components/event';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { PlaceButton } from '@/components/pickers/PlaceButton';
import { PlaceSheet } from '@/components/pickers/PlaceSheet';
import { EmptyState, ErrorState, ListGroup, Skeleton, Text } from '@/components/ui';
import { useEventSearch } from '@/hooks/useEvents';
import { placeCityIds, placeName, usePlaceStore } from '@/store/placeStore';
import { radius, spacing } from '@/theme';

const DAYS = 30;

const dayLabel = (date: Date, now: Date) => {
  const diff = istDayDiff(date, now);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return formatLongDate(date);
};

/** Next 30 days in date order (spec §53). Month and week views come with tracking in a later phase. */
export function CalendarScreen() {
  const place = usePlaceStore((s) => s.place);
  const setPlace = usePlaceStore((s) => s.setPlace);
  const [placeOpen, setPlaceOpen] = useState(false);
  // Fixed for the life of the screen so the query key stays stable.
  const [range] = useState(() => {
    const now = new Date();
    return { now, from: istStartOfDay(now).toISOString(), to: istStartOfDay(now, DAYS).toISOString() };
  });
  const query = useMemo(() => ({ from: range.from, to: range.to, cityIds: placeCityIds(place), sort: 'date' as const, limit: 50 }), [range, place]);
  const results = useEventSearch(query);

  // The agenda is short (30 days), so load every page up front.
  useEffect(() => {
    if (results.hasNextPage && !results.isFetchingNextPage) results.fetchNextPage();
  }, [results]);

  const groups = useMemo(() => {
    const events = results.data?.pages.flatMap((p) => p.items) ?? [];
    const map = new Map<string, { label: string; events: EventSummary[] }>();
    for (const event of events) {
      if (event.status === 'cancelled') continue;
      // Events that started earlier but are still running appear under Today.
      const start = new Date(event.startAt);
      const day = start < range.now ? istStartOfDay(range.now) : istStartOfDay(start);
      const key = day.toISOString();
      if (!map.has(key)) map.set(key, { label: dayLabel(day, range.now), events: [] });
      map.get(key)!.events.push(event);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g);
  }, [results.data, range.now]);

  return (
    <>
      <LargeTitleScrollView title="Calendar" tabRoot headerRight={<PlaceButton label={placeName(place)} onPress={() => setPlaceOpen(true)} />}>
        <Text variant="subheadline" tone="secondary" style={styles.sub}>
          Next {DAYS} days
        </Text>
        <View style={styles.body}>
          {results.isPending ? (
            [0, 1].map((i) => (
              <View key={i} style={styles.skeletonGroup}>
                <Skeleton width={140} height={20} />
                <Skeleton height={150} round={radius.lg} />
              </View>
            ))
          ) : results.isError ? (
            <ErrorState onRetry={() => results.refetch()} />
          ) : groups.length === 0 ? (
            <EmptyState icon="calendar-clear-outline" title="Nothing in the Next 30 Days" message={`No events found in ${placeName(place)}. Try another location.`} actionLabel="Change Location" onAction={() => setPlaceOpen(true)} />
          ) : (
            groups.map((group) => (
              <ListGroup key={group.label} header={group.label}>
                {group.events.map((event) => (
                  <CompactEventRow key={event.id} event={event} showCountdown={false} />
                ))}
              </ListGroup>
            ))
          )}
        </View>
      </LargeTitleScrollView>
      <PlaceSheet visible={placeOpen} onClose={() => setPlaceOpen(false)} value={place} onChange={(p) => p && setPlace(p)} />
    </>
  );
}

const styles = StyleSheet.create({
  sub: { paddingHorizontal: spacing.lg, marginTop: -spacing.xs },
  body: { paddingHorizontal: spacing.lg, gap: spacing.xxl, marginTop: spacing.xl },
  skeletonGroup: { gap: spacing.sm },
});
