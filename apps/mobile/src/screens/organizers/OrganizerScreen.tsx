import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { EventRow, rowPosition } from '@/components/event';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { Avatar, Button, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { useOrganizer } from '@/hooks/useEvents';
import { openExternal } from '@/services/links';
import { radius, spacing, useTheme } from '@/theme';

/** Organizer profile with their upcoming and past events (spec §36, §75). */
export function OrganizerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useOrganizer(id);
  const { colors } = useTheme();
  const data = profile.data;

  return (
    <LargeTitleScrollView title={data?.organizer.name ?? 'Organizer'} back>
      {profile.isPending ? (
        <View style={styles.pad}>
          <Skeleton height={140} round={radius.lg} />
        </View>
      ) : profile.isError ? (
        <ErrorState onRetry={() => profile.refetch()} />
      ) : !data ? (
        <EmptyState icon="business-outline" title="Organizer Not Found" />
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Avatar name={data.organizer.name} size={64} />
            {data.organizer.description ? (
              <Text variant="body" tone="secondary" style={styles.center}>
                {data.organizer.description}
              </Text>
            ) : null}
            {data.organizer.website ? <Button title="Website" icon="globe-outline" variant="tinted" onPress={() => openExternal(data.organizer.website!)} /> : null}
          </View>

          <Text variant="title2" style={styles.heading} accessibilityRole="header">
            Upcoming Events
          </Text>
          {data.upcoming.length ? (
            data.upcoming.map((e, i) => <EventRow key={e.id} event={e} position={rowPosition(i, data.upcoming.length)} />)
          ) : (
            <Text variant="subheadline" tone="secondary" style={styles.pad}>
              No upcoming events listed.
            </Text>
          )}

          {data.past.length ? (
            <>
              <Text variant="title2" style={styles.heading} accessibilityRole="header">
                Past Events
              </Text>
              {data.past.map((e, i) => (
                <EventRow key={e.id} event={e} position={rowPosition(i, data.past.length)} />
              ))}
            </>
          ) : null}
        </>
      )}
    </LargeTitleScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  card: { marginHorizontal: spacing.lg, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  center: { textAlign: 'center' },
  heading: { paddingHorizontal: spacing.lg, marginTop: spacing.xxl, marginBottom: spacing.md },
});
