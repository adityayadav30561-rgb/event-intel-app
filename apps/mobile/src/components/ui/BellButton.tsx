import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useInbox } from '@/hooks/useAlerts';
import { useTheme } from '@/theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

/** Opens the notification inbox; shows how many are unread. */
export function BellButton() {
  const { colors } = useTheme();
  const unread = useInbox().data?.unread ?? 0;
  return (
    <View>
      <IconButton icon={unread ? 'notifications' : 'notifications-outline'} label={unread ? `Notifications, ${unread} unread` : 'Notifications'} onPress={() => router.push('/notifications')} />
      {unread ? (
        <View style={[styles.badge, { backgroundColor: colors.red, pointerEvents: 'none' }]}>
          <Text variant="caption2Strong" tone="white">
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
});
