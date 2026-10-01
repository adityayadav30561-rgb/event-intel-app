import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { EmptyState, SegmentedControl } from '@/components/ui';
import { spacing } from '@/theme';

type Segment = 'saved' | 'following' | 'planned' | 'past';

const EMPTY: Record<Segment, { icon: 'bookmark-outline' | 'notifications-outline' | 'walk-outline' | 'time-outline'; title: string; message: string }> = {
  saved: { icon: 'bookmark-outline', title: 'No Saved Events', message: 'Events you save will be kept here, ready to plan your visits.' },
  following: { icon: 'notifications-outline', title: 'Not Following Any Events', message: 'Follow an event to hear about changes and get reminders before it starts.' },
  planned: { icon: 'walk-outline', title: 'No Planned Visits', message: 'Events you plan to visit appear here with a countdown and checklist.' },
  past: { icon: 'time-outline', title: 'No Past Events', message: 'Events you have visited will be listed here.' },
};

/** My Events (spec §45). Saving, following and visit planning arrive with event tracking. */
export function MyEventsScreen() {
  const [segment, setSegment] = useState<Segment>('saved');
  const empty = EMPTY[segment];
  return (
    <LargeTitleScrollView
      title="My Events"
      tabRoot
      accessory={
        <SegmentedControl
          value={segment}
          onChange={setSegment}
          segments={[
            { value: 'saved', label: 'Saved' },
            { value: 'following', label: 'Following' },
            { value: 'planned', label: 'Planned' },
            { value: 'past', label: 'Past' },
          ]}
        />
      }
    >
      <View style={styles.body}>
        <EmptyState icon={empty.icon} title={empty.title} message={`${empty.message} Saving and following are coming in the next update.`} actionLabel="Explore Events" onAction={() => router.navigate('/explore')} />
      </View>
    </LargeTitleScrollView>
  );
}

const styles = StyleSheet.create({ body: { paddingTop: spacing.xxl } });
