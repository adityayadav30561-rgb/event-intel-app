import { Ionicons } from '@expo/vector-icons';
import { eventDayCount, formatTime, formatTimeRange, istDayDiff, type EventDetail } from '@eii/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { EmptyState, ListGroup, ListRow, Skeleton, Text } from '@/components/ui';
import { useEvent } from '@/hooks/useEvents';
import { useNow } from '@/hooks/useNow';
import { useChecklist, useNote } from '@/hooks/useTracking';
import { useHasPack } from '@/services/offlinePacks';
import { openDirections } from '@/services/links';
import { AgendaRow } from '@/screens/events/EventDetailScreen';
import { radius, spacing, useTheme } from '@/theme';

/** Which day of the event today is (1-based), or undefined before/after it. */
function eventDayNumber(e: EventDetail, now: number): number | undefined {
  const day = -istDayDiff(new Date(e.startAt), new Date(now)) + 1;
  return day >= 1 && day <= eventDayCount(new Date(e.startAt), new Date(e.endAt)) ? day : undefined;
}

function Tile({ icon, label, detail, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; detail?: string; color: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.tile, { backgroundColor: colors.surface }, pressed && { opacity: 0.6 }]}>
      <View style={[styles.tileIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={18} color="#FFFFFF" />
      </View>
      <Text variant="headline">{label}</Text>
      {detail ? (
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Event Day Mode (§55): what you need at the venue, on one screen. Opens from Home, My Events,
 * and "starts tomorrow" or reminder alerts. Works offline from the event's saved copy.
 */
export function EventDayScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useEvent(id);
  const now = useNow();
  const checklist = useChecklist(id ?? '');
  const note = useNote(id ?? '');
  const offline = useHasPack(id);
  const e = event.data;

  if (!e) {
    return event.isPending ? (
      <LargeTitleScrollView title="Event Day" back>
        <View style={styles.body}>
          <Skeleton height={80} round={radius.lg} />
          <Skeleton height={160} round={radius.lg} />
        </View>
      </LargeTitleScrollView>
    ) : (
      <EmptyState icon="calendar-outline" title="Event Not Available" message="Save it for offline use next time, so it opens without a connection." />
    );
  }

  const day = eventDayNumber(e, now);
  const daysAway = istDayDiff(new Date(e.startAt), new Date(now));
  const heading = day ? (eventDayCount(new Date(e.startAt), new Date(e.endAt)) > 1 ? `Day ${day}` : 'Today') : daysAway === 1 ? 'Tomorrow' : 'Event Day';
  const agenda = e.agenda
    .filter((a) => (day ? a.day === day : a.day === 1))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const next = agenda.find((a) => new Date(a.endsAt ?? a.startsAt).getTime() >= now);
  const done = checklist.filter((i) => i.done).length;
  // Daily hours: the event's opening and closing times, the same each day.
  const hours = e.allDay ? 'All day' : `${formatTimeRange(new Date(e.startAt), new Date(e.endAt))} IST`;
  const nowOn = next ? new Date(next.startsAt).getTime() <= now : false;

  return (
    <LargeTitleScrollView title={heading} back>
      <View style={styles.body}>
        <View style={[styles.hero, { backgroundColor: colors.surface }]}>
          <Text variant="title2" numberOfLines={3}>
            {e.title}
          </Text>
          <Text variant="subheadline" tone="secondary">
            {e.attendanceMode === 'online' ? 'Online' : [e.venue?.name, e.city].filter(Boolean).join(' · ')} · {e.allDay ? 'All day' : hours}
          </Text>
          {next ? (
            <Text variant="subheadlineStrong" tone="tint">
              {nowOn ? 'Now' : 'Next'}: {formatTime(new Date(next.startsAt))} · {next.title}
            </Text>
          ) : null}
          {offline ? (
            <View style={styles.offline}>
              <Ionicons name="cloud-done" size={14} color={colors.green} />
              <Text variant="footnote" tone="secondary">
                Saved on this phone: works without signal
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.grid}>
          {e.attendanceMode !== 'online' && e.venue ? <Tile icon="navigate" label="Directions" detail={e.venue.name} color={colors.blue} onPress={() => openDirections(e.venue!)} /> : null}
          <Tile icon="checkmark-circle" label="Checklist" detail={`${done} of ${checklist.length} done`} color={colors.green} onPress={() => router.push(`/event/${e.id}/checklist`)} />
          <Tile icon="document-text" label="My Note" detail={note ? note.split('\n')[0] : 'Add a note'} color={colors.yellow} onPress={() => router.push(`/event/${e.id}/note`)} />
          {e.exhibitors.length ? <Tile icon="storefront" label="Exhibitors" detail={`${e.exhibitors.length}`} color={colors.orange} onPress={() => router.push(`/event/${e.id}/exhibitors`)} /> : null}
          {e.speakers.length ? <Tile icon="mic" label="Speakers" detail={`${e.speakers.length}`} color={colors.indigo} onPress={() => router.push(`/event/${e.id}/speakers`)} /> : null}
          <Tile icon="information-circle" label="Event Details" color={colors.gray} onPress={() => router.push(`/event/${e.id}`)} />
        </View>

        {agenda.length ? (
          <ListGroup header={day ? 'Today’s Agenda' : 'Agenda'} separatorInset={spacing.lg}>
            {agenda.map((item) => (
              <AgendaRow key={item.id} time={formatTime(new Date(item.startsAt))} title={item.title} room={item.room} speaker={e.speakers.find((s) => item.speakerIds?.includes(s.id))?.name} />
            ))}
          </ListGroup>
        ) : (
          <ListGroup>
            <ListRow icon="list" iconColor={colors.gray} title="No agenda published" subtitle="Check the event’s website for sessions." />
          </ListGroup>
        )}
      </View>
    </LargeTitleScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  hero: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { width: '47.5%', flexGrow: 1, borderRadius: radius.lg, padding: spacing.md, gap: 4, minHeight: 96 },
  tileIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
});
