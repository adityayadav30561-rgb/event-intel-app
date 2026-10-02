import { describeChange, formatCountdown, formatRelativePast, formatWeekdayDate, STATUS_LABELS, VISIT_STATUS_LABELS, type EventSummary, type TrackedEvent } from '@eii/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { CompactEventRow } from '@/components/event';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { EventDayCards } from '@/components/tracking/EventDayCard';
import { Button, EmptyState, ListGroup, SegmentedControl, Text } from '@/components/ui';
import { trackingActions, useMyEvents, type MyEventsList } from '@/hooks/useTracking';
import { syncTracking } from '@/services/trackingSync';
import { useTrackingStore } from '@/store/trackingStore';
import { radius, spacing, useTheme } from '@/theme';

type Icon = 'bookmark-outline' | 'notifications-outline' | 'walk-outline' | 'flag-outline' | 'time-outline';

const EMPTY: Record<MyEventsList, { icon: Icon; title: string; message: string }> = {
  saved: { icon: 'bookmark-outline', title: 'No Saved Events', message: 'Tap Save on an event to keep it here for later.' },
  following: { icon: 'notifications-outline', title: 'Not Following Any Events', message: 'Follow an event to see here when its dates, venue or status change.' },
  planned: { icon: 'walk-outline', title: 'No Planned Visits', message: 'Set Visit to “Planning to Visit” on an event. It’s kept on your phone for the day, with a checklist.' },
  attended: { icon: 'flag-outline', title: 'No Visits Yet', message: 'Events you mark as visited are kept here.' },
  past: { icon: 'time-outline', title: 'No Past Events', message: 'Saved and followed events that have ended move here.' },
};

/** What the row says under the title, per list. */
function noteFor(list: MyEventsList, event: EventSummary, tracked: TrackedEvent): string | undefined {
  const status = event.status !== 'upcoming' ? STATUS_LABELS[event.status] : undefined;
  const countdown = formatCountdown(new Date(event.startAt), new Date(event.endAt));
  if (list === 'following' && event.lastChange) {
    return [describeChange(event.lastChange), formatRelativePast(new Date(event.lastChange.detectedAt))].join(' · ');
  }
  if (list === 'planned') {
    const visit = tracked.status ? VISIT_STATUS_LABELS[tracked.status] : undefined;
    const day = tracked.visitDate ? formatWeekdayDate(new Date(`${tracked.visitDate}T12:00:00+05:30`)) : undefined;
    return [status, visit, day, countdown].filter(Boolean).join(' · ');
  }
  if (list === 'attended') return tracked.visitedAt ? `Visited · marked ${formatRelativePast(new Date(tracked.visitedAt))}` : 'Visited';
  if (list === 'past') return tracked.status === 'not_visited' ? 'Didn’t visit' : 'Ended';
  return [status, countdown].filter(Boolean).join(' · ') || undefined;
}

/** My Events (spec §45): Saved · Following · Planned · Attended · Past. Works offline. */
export function MyEventsScreen() {
  const { colors } = useTheme();
  const [list, setList] = useState<MyEventsList>('saved');
  const [refreshing, setRefreshing] = useState(false);
  const { lists, awaitingAnswer, hydrated } = useMyEvents();
  const pending = useTrackingStore((s) => s.outbox.length);
  const rows = lists[list];
  const empty = EMPTY[list];

  const refresh = async () => {
    setRefreshing(true);
    await syncTracking();
    setRefreshing(false);
  };

  return (
    <LargeTitleScrollView
      title="My Events"
      tabRoot
      scrollProps={{ refreshControl: <RefreshControl refreshing={refreshing} onRefresh={refresh} /> }}
      accessory={
        <SegmentedControl
          value={list}
          onChange={setList}
          segments={[
            { value: 'saved', label: 'Saved' },
            { value: 'following', label: 'Following' },
            { value: 'planned', label: 'Planned' },
            { value: 'attended', label: 'Visited' },
            { value: 'past', label: 'Past' },
          ]}
        />
      }
    >
      <View style={styles.dayCards}>
        <EventDayCards />
      </View>
      <View style={styles.body}>
        {awaitingAnswer.slice(0, 3).map(({ event }) => (
          <View key={event.id} style={[styles.prompt, { backgroundColor: colors.surface }]}>
            <Text variant="footnote" tone="secondary">
              Did you visit?
            </Text>
            <Text variant="headline" numberOfLines={2}>
              {event.title}
            </Text>
            <View style={styles.promptButtons}>
              <Button title="Visited" icon="flag" variant="tinted" style={styles.flex} onPress={() => trackingActions(event).setStatus('visited')} />
              <Button title="Didn’t Go" variant="gray" style={styles.flex} onPress={() => trackingActions(event).setStatus('not_visited')} />
            </View>
          </View>
        ))}

        {!hydrated ? null : rows.length ? (
          <ListGroup separatorInset={78}>
            {rows.map(({ event, tracked }) => (
              <CompactEventRow key={event.id} event={event} note={noteFor(list, event, tracked)} />
            ))}
          </ListGroup>
        ) : (
          <View style={styles.empty}>
            <EmptyState icon={empty.icon} title={empty.title} message={empty.message} actionLabel="Explore Events" onAction={() => router.navigate('/explore')} />
          </View>
        )}

        {pending > 0 ? (
          <Text variant="footnote" tone="secondary" style={styles.center}>
            {pending === 1 ? '1 change' : `${pending} changes`} saved on this phone, waiting to sync
          </Text>
        ) : null}
      </View>
    </LargeTitleScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.lg },
  dayCards: { paddingTop: spacing.lg },
  empty: { paddingTop: spacing.xl },
  prompt: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  promptButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
});
