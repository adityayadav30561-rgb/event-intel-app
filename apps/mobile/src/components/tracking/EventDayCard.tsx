import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Artwork } from '@/components/event';
import { PressableScale, Text } from '@/components/ui';
import { useTodayEvents } from '@/hooks/useTracking';
import { radius, shadow, spacing } from '@/theme';

/** On Home and My Events when an event you track is on today: one tap into Event Day Mode. */
export function EventDayCards() {
  const today = useTodayEvents();
  if (!today.length) return null;
  return (
    <View style={styles.list}>
      {today.map((e) => (
        <PressableScale key={e.id} onPress={() => router.push(`/event/${e.id}/day`)} accessibilityRole="button" accessibilityLabel={`Today: ${e.title}. Open event day`} style={[styles.card, shadow.card]}>
          <Artwork artwork={e.artwork} imageUrl={e.imageUrl} scrim style={StyleSheet.absoluteFill} />
          <View style={styles.top}>
            <Ionicons name="today" size={16} color="#FFFFFF" />
            <Text variant="footnoteStrong" tone="white">
              Today
            </Text>
          </View>
          <View>
            <Text variant="title3" tone="white" numberOfLines={2}>
              {e.title}
            </Text>
            <View style={styles.cta}>
              <Text variant="subheadlineStrong" style={styles.soft} numberOfLines={1}>
                {e.attendanceMode === 'online' ? 'Online' : [e.venueName, e.city].filter(Boolean).join(' · ')}
              </Text>
              <Text variant="subheadlineStrong" tone="white">
                Event Day ›
              </Text>
            </View>
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
  card: { height: 150, borderRadius: radius.xl, overflow: 'hidden', padding: spacing.lg, justifyContent: 'space-between' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, marginTop: 4 },
  soft: { color: 'rgba(255,255,255,0.88)', flex: 1 },
});
