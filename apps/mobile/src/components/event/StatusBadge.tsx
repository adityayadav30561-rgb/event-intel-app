import { Ionicons } from '@expo/vector-icons';
import { STATUS_LABELS, type EventStatus } from '@eii/shared';
import { StyleSheet, View } from 'react-native';
import { Glass, Text } from '@/components/ui';
import { radius, useTheme, type ColorTokens } from '@/theme';

const icon: Partial<Record<EventStatus, keyof typeof Ionicons.glyphMap>> = {
  ongoing: 'radio-button-on',
  cancelled: 'close-circle',
  postponed: 'time',
  rescheduled: 'calendar',
  registration_closed: 'lock-closed',
  completed: 'checkmark-circle',
};

const tone = (c: ColorTokens, status: EventStatus) =>
  ({
    upcoming: c.tint,
    ongoing: c.green,
    completed: c.gray,
    cancelled: c.red,
    postponed: c.orange,
    rescheduled: c.indigo,
    registration_closed: c.gray,
  })[status];

/** Status capsule: icon + text, never colour alone (spec §121). Hidden for ordinary upcoming events. */
export function StatusBadge({ status, onArtwork }: { status: EventStatus; onArtwork?: boolean }) {
  const { colors } = useTheme();
  if (status === 'upcoming') return null;
  const color = tone(colors, status);
  const content = (
    <>
      <Ionicons name={icon[status] ?? 'information-circle'} size={13} color={onArtwork ? '#FFFFFF' : color} />
      <Text variant="caption1Strong" style={{ color: onArtwork ? '#FFFFFF' : color }} numberOfLines={1}>
        {STATUS_LABELS[status]}
      </Text>
    </>
  );
  if (onArtwork) {
    return (
      <Glass style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.28)', borderColor: 'rgba(255,255,255,0.25)' }]}>{content}</Glass>
    );
  }
  return <View style={[styles.badge, { backgroundColor: `${color}1F` }]}>{content}</View>;
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, height: 22, borderRadius: radius.pill },
});
