import { describePreferences, formatDateTimeIST, formatRelativePast } from '@eii/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { PlaceSheet } from '@/components/pickers/PlaceSheet';
import { InstallGuideSheet, isInstalledWebApp } from '@/components/ui/InstallPrompt';
import { Avatar, Button, ListGroup, ListRow, Sheet, Text } from '@/components/ui';
import { BUILD } from '@/constants/build';
import { usePreferences, useSignOut } from '@/hooks/useAccount';
import { useSyncStatus } from '@/hooks/useEvents';
import { usePackIndex } from '@/services/offlinePacks';
import { placeName, usePlaceStore } from '@/store/placeStore';
import { useCurrentUser } from '@/store/sessionStore';
import { radius, spacing, useTheme } from '@/theme';

/** More — settings and app information (spec §84). Rows appear as their features ship. */
export function MoreScreen() {
  const { colors } = useTheme();
  const place = usePlaceStore((s) => s.place);
  const setPlace = usePlaceStore((s) => s.setPlace);
  const [sheet, setSheet] = useState<'place' | 'install' | 'sign-out' | null>(null);
  const user = useCurrentUser();
  const interests = describePreferences(usePreferences().data, 1);
  const signOut = useSignOut();
  const packCount = Object.keys(usePackIndex((s) => s.packs)).length;
  const sync = useSyncStatus().data;
  const dataDetail = !sync ? undefined : sync.mode === 'sample' ? 'Sample' : sync.lastUpdatedAt ? `Updated ${formatRelativePast(new Date(sync.lastUpdatedAt))}` : 'Not yet updated';
  const showInstall = Platform.OS === 'web' && !isInstalledWebApp();
  const updated = BUILD.builtAt ? formatDateTimeIST(new Date(BUILD.builtAt)) : 'Development build';

  return (
    <>
      <LargeTitleScrollView title="More" tabRoot>
        <View style={styles.body}>
          {user ? (
            <View style={[styles.account, { backgroundColor: colors.surface }]}>
              <Avatar name={user.name} size={56} />
              <View style={styles.accountText}>
                <Text variant="title3" numberOfLines={1}>
                  {user.name}
                </Text>
                <Text variant="subheadline" tone="secondary" numberOfLines={1}>
                  {user.email}
                </Text>
              </View>
            </View>
          ) : null}

          <ListGroup>
            <ListRow icon="sparkles" iconColor={colors.orange} title="Interests" detail={interests ?? 'None'} onPress={() => router.push('/settings/interests')} />
            <ListRow icon="key" iconColor={colors.gray} title="Password" onPress={() => router.push('/settings/password')} />
            {user?.role === 'admin' ? <ListRow icon="people" iconColor={colors.blue} title="Team" onPress={() => router.push('/settings/team')} /> : null}
          </ListGroup>

          <ListGroup>
            <ListRow icon="cloud-download" iconColor={colors.indigo} title="Offline Storage" detail={packCount ? `${packCount} ${packCount === 1 ? 'event' : 'events'}` : 'None'} onPress={() => router.push('/settings/offline')} />
          </ListGroup>

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

          <ListGroup>
            <ListRow title="Sign Out" destructive onPress={() => setSheet('sign-out')} />
          </ListGroup>

          <Text variant="footnote" tone="secondary" style={styles.version}>
            Version {BUILD.version} · Updated {updated}
          </Text>
        </View>
      </LargeTitleScrollView>
      <PlaceSheet visible={sheet === 'place'} onClose={() => setSheet(null)} value={place} onChange={(p) => p && setPlace(p)} />
      <InstallGuideSheet visible={sheet === 'install'} onClose={() => setSheet(null)} />
      <Sheet visible={sheet === 'sign-out'} onClose={() => setSheet(null)} title="Sign Out" actionLabel="Cancel">
        <View style={styles.sheetBody}>
          <Text variant="body" tone="secondary" style={styles.version}>
            Events saved on this phone for offline use are removed. Your interests stay with your account.
          </Text>
          <Button title="Sign Out" size="large" block onPress={signOut} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.xxl, paddingTop: spacing.sm },
  version: { textAlign: 'center' },
  account: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg },
  accountText: { flex: 1, minWidth: 0, gap: 2 },
  sheetBody: { paddingHorizontal: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
});
