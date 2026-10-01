import { formatDateTimeIST, formatRelativePast } from '@eii/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { PlaceSheet } from '@/components/pickers/PlaceSheet';
import { InstallGuideSheet, isInstalledWebApp } from '@/components/ui/InstallPrompt';
import { ListGroup, ListRow, Text } from '@/components/ui';
import { BUILD } from '@/constants/build';
import { useSyncStatus } from '@/hooks/useEvents';
import { placeName, usePlaceStore } from '@/store/placeStore';
import { spacing, useTheme } from '@/theme';

/** More — settings and app information (spec §84). Rows appear as their features ship. */
export function MoreScreen() {
  const { colors } = useTheme();
  const place = usePlaceStore((s) => s.place);
  const setPlace = usePlaceStore((s) => s.setPlace);
  const [sheet, setSheet] = useState<'place' | 'install' | null>(null);
  const sync = useSyncStatus().data;
  const dataDetail = !sync ? undefined : sync.mode === 'sample' ? 'Sample' : sync.lastUpdatedAt ? `Updated ${formatRelativePast(new Date(sync.lastUpdatedAt))}` : 'Not yet updated';
  const showInstall = Platform.OS === 'web' && !isInstalledWebApp();
  const updated = BUILD.builtAt ? formatDateTimeIST(new Date(BUILD.builtAt)) : 'Development build';

  return (
    <>
      <LargeTitleScrollView title="More" tabRoot>
        <View style={styles.body}>
          <ListGroup footer="Used for Home and Calendar. Explore has its own location filter.">
            <ListRow icon="location" iconColor={colors.blue} title="Location" detail={placeName(place)} onPress={() => setSheet('place')} />
          </ListGroup>

          {showInstall ? (
            <ListGroup footer="Opens full-screen with its own icon, like any other app.">
              <ListRow icon="add" iconColor={colors.gray} title="Add to Home Screen" onPress={() => setSheet('install')} />
            </ListGroup>
          ) : null}

          <ListGroup>
            <ListRow icon="information" iconColor={colors.indigo} title="About Event Intel" onPress={() => router.push('/about')} />
            <ListRow icon="sync" iconColor={colors.green} title="Event Data" detail={dataDetail} onPress={() => router.push('/about')} />
          </ListGroup>

          <Text variant="footnote" tone="secondary" style={styles.version}>
            Version {BUILD.version} · Updated {updated}
          </Text>
        </View>
      </LargeTitleScrollView>
      <PlaceSheet visible={sheet === 'place'} onClose={() => setSheet(null)} value={place} onChange={(p) => p && setPlace(p)} />
      <InstallGuideSheet visible={sheet === 'install'} onClose={() => setSheet(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.xxl, paddingTop: spacing.sm },
  version: { textAlign: 'center' },
});
