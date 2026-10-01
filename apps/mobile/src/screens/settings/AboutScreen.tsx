import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { ListGroup, ListRow, Text } from '@/components/ui';
import { BUILD } from '@/constants/build';
import { useIsSampleData } from '@/hooks/useEvents';
import { shadow, spacing, useTheme } from '@/theme';

/** What the app is for, and what it deliberately is not (spec §2, §163). */
export function AboutScreen() {
  const { colors } = useTheme();
  const isSampleData = useIsSampleData();
  return (
    <LargeTitleScrollView title="About" back>
      <View style={styles.body}>
        <View style={styles.hero}>
          <View style={[styles.iconWrap, shadow.card]}>
            <Image source={require('../../../assets/images/icon.png')} style={styles.icon} accessibilityLabel="Event Intel app icon" />
          </View>
          <Text variant="title2">Event Intelligence India</Text>
          <Text variant="subheadline" tone="secondary">
            Version {BUILD.version}
          </Text>
        </View>

        <Text variant="body" tone="secondary" style={styles.center}>
          Find professional events across India, decide which are worth attending, and keep track of them until the day you visit.
        </Text>

        <ListGroup header="How It Works">
          <ListRow icon="search" iconColor={colors.blue} title="Discover" subtitle="Conferences, expos and summits across India" />
          <ListRow icon="ribbon" iconColor={colors.indigo} title="Evaluate" subtitle="What it covers, who attends and who exhibits" />
          <ListRow icon="bookmark" iconColor={colors.orange} title="Track" subtitle="Save, follow and plan visits" />
          <ListRow icon="notifications" iconColor={colors.red} title="Remember" subtitle="Reminders and change alerts" />
          <ListRow icon="walk" iconColor={colors.green} title="Visit" subtitle="Agenda, exhibitors and directions on the day" />
        </ListGroup>

        {isSampleData ? (
          <ListGroup header="Event Data" footer="Sample events are generated for previewing the app. Their organizers, venues, speakers and exhibitors are fictional. Live event data replaces them in a later update.">
            <ListRow icon="flask" iconColor={colors.orange} title="Showing sample events" />
          </ListGroup>
        ) : null}

        <Text variant="footnote" tone="tertiary" style={styles.center}>
          The app tracks events only. Contacts and leads met at events stay in the team’s own workflow.
        </Text>
      </View>
    </LargeTitleScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.xxl },
  hero: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  iconWrap: { borderRadius: 22, marginBottom: spacing.md },
  icon: { width: 96, height: 96, borderRadius: 22 },
  center: { textAlign: 'center', paddingHorizontal: spacing.sm },
});
