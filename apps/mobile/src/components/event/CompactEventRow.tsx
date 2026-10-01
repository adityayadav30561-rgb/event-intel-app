import { EVENT_TYPE_LABELS, formatCountdown, type EventSummary } from '@eii/shared';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { spacing, useTheme } from '@/theme';
import { DateTile } from './DateTile';
import { endOf, openEvent, startOf } from './meta';
import { StatusBadge } from './StatusBadge';

/** Chronological row with a calendar date tile — for "This Week" and the calendar agenda. */
export function CompactEventRow({ event, showCountdown = true }: { event: EventSummary; showCountdown?: boolean }) {
  const { colors } = useTheme();
  const countdown = showCountdown ? formatCountdown(startOf(event), endOf(event)) : undefined;
  const place = event.attendanceMode === 'online' ? 'Online' : event.city;
  return (
    <Pressable
      onPress={() => openEvent(event.id)}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${place}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.quaternaryFill }]}
    >
      <DateTile date={startOf(event)} />
      <View style={styles.text}>
        <Text variant="headline" numberOfLines={2}>
          {event.title}
        </Text>
        <Text variant="subheadline" tone="secondary" numberOfLines={1}>
          {place} · {EVENT_TYPE_LABELS[event.eventType]}
        </Text>
        {event.status !== 'upcoming' ? (
          <View style={styles.badge}>
            <StatusBadge status={event.status} />
          </View>
        ) : countdown ? (
          <Text variant="footnoteStrong" style={{ color: countdown === 'Happening now' ? colors.green : colors.tint }}>
            {countdown}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.tertiaryLabel} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.lg },
  text: { flex: 1, minWidth: 0, gap: 2 },
  badge: { marginTop: 3 },
});
