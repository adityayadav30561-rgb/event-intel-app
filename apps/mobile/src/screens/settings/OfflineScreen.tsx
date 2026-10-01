import { formatDateRange } from '@eii/shared';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { Button, EmptyState, IconButton, ListGroup, ListRow, Text } from '@/components/ui';
import { removeAllPacks, removePack, usePackIndex } from '@/services/offlinePacks';
import { spacing, useTheme } from '@/theme';

export const formatBytes = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** More → Offline Storage (§81): events kept on this phone, with their sizes. */
export function OfflineScreen() {
  const { colors } = useTheme();
  const packs = Object.values(usePackIndex((s) => s.packs)).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const total = packs.reduce((sum, p) => sum + p.bytes, 0);

  return (
    <LargeTitleScrollView title="Offline Storage" back>
      <View style={styles.body}>
        <Text variant="body" tone="secondary" style={styles.intro}>
          These events open with no signal: overview, venue, agenda, speakers and exhibitors. Events you plan to visit are added automatically.
        </Text>
        {packs.length ? (
          <>
            <ListGroup footer={`${packs.length} ${packs.length === 1 ? 'event' : 'events'} · ${formatBytes(total)} on this phone`}>
              {packs.map((p) => (
                <ListRow
                  key={p.id}
                  icon="cloud-done"
                  iconColor={colors.indigo}
                  title={p.title}
                  subtitle={`${formatDateRange(new Date(p.startAt), new Date(p.startAt))} · ${formatBytes(p.bytes)}`}
                  onPress={() => router.push(`/event/${p.id}`)}
                  trailing={<IconButton icon="trash-outline" label={`Remove ${p.title}`} variant="plain" size={34} color={colors.red} onPress={() => void removePack(p.id)} />}
                />
              ))}
            </ListGroup>
            <Button title="Remove All" variant="gray" block onPress={() => void removeAllPacks()} />
          </>
        ) : (
          <EmptyState icon="cloud-download-outline" title="Nothing Saved Offline" message="Turn on Available Offline on an event, or plan to visit it." />
        )}
      </View>
    </LargeTitleScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  intro: { paddingHorizontal: spacing.xs },
});
