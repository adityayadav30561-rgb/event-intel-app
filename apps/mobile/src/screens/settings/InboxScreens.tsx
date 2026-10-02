import { Ionicons } from '@expo/vector-icons';
import { formatDateTimeIST, formatRelativePast, reminderLabel, type AppNotification, type NotificationType } from '@eii/shared';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { EmptyState, ErrorState, IconButton, ListGroup, ListRow, Skeleton, Text } from '@/components/ui';
import { useInbox, useMarkRead, useReminders, useRemoveReminder } from '@/hooks/useAlerts';
import { errorMessage } from '@/lib/errors';
import { analytics } from '@/services/analytics';
import { radius, spacing, useTheme, type ColorTokens } from '@/theme';

const ICON: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  change: 'sparkles',
  saved_search: 'bookmark',
  interests: 'star',
  reminder: 'alarm',
  starts_tomorrow: 'calendar',
};
const tint = (c: ColorTokens, n: AppNotification) =>
  n.critical ? c.red : ({ change: c.orange, saved_search: c.indigo, interests: c.green, reminder: c.blue, starts_tomorrow: c.red } as const)[n.type];

/** The notification inbox (§91): every alert, read or not; tapping opens its screen. */
export function InboxScreen() {
  const { colors } = useTheme();
  const inbox = useInbox();
  const markRead = useMarkRead();
  const items = inbox.data?.items ?? [];
  const unread = inbox.data?.unread ?? 0;

  const open = (n: AppNotification) => {
    analytics.track('notification_open', { type: n.type });
    if (!n.readAt) markRead.mutate([n.id]);
    router.push(n.url as Href);
  };

  return (
    <LargeTitleScrollView
      title="Notifications"
      back
      headerRight={
        unread ? (
          <Pressable onPress={() => markRead.mutate(undefined)} hitSlop={10} accessibilityRole="button">
            <Text variant="body" tone="tint">
              Mark All Read
            </Text>
          </Pressable>
        ) : undefined
      }
    >
      <View style={styles.body}>
        {inbox.isPending && !inbox.data ? (
          <View style={[styles.skeleton, { backgroundColor: colors.surface }]}>
            <Skeleton height={44} />
            <Skeleton height={44} />
          </View>
        ) : inbox.isError && !inbox.data ? (
          <ErrorState message={errorMessage(inbox.error)} onRetry={() => inbox.refetch()} />
        ) : items.length ? (
          <ListGroup separatorInset={60}>
            {items.map((n) => (
              <Pressable key={n.id} onPress={() => open(n)} accessibilityRole="button" style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.quaternaryFill }]}>
                <View style={[styles.icon, { backgroundColor: tint(colors, n) }]}>
                  <Ionicons name={n.critical ? 'alert' : ICON[n.type]} size={17} color="#FFFFFF" />
                </View>
                <View style={styles.text}>
                  <View style={styles.titleRow}>
                    <Text variant={n.readAt ? 'body' : 'headline'} numberOfLines={2} style={styles.flex}>
                      {n.title}
                    </Text>
                    {!n.readAt ? <View style={[styles.dot, { backgroundColor: colors.tint }]} accessibilityLabel="Unread" /> : null}
                  </View>
                  {n.body ? (
                    <Text variant="subheadline" tone="secondary" numberOfLines={3}>
                      {n.body}
                    </Text>
                  ) : null}
                  <Text variant="footnote" tone="tertiary">
                    {formatRelativePast(new Date(n.createdAt))}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ListGroup>
        ) : (
          <EmptyState icon="notifications-outline" title="No Notifications" message="Changes to events you follow, saved-search matches and reminders appear here." />
        )}
      </View>
    </LargeTitleScrollView>
  );
}

/** Reminder Center (§49, §136): every reminder you set, soonest first. */
export function RemindersScreen() {
  const { colors } = useTheme();
  const reminders = useReminders();
  const remove = useRemoveReminder();
  const upcoming = (reminders.data ?? []).filter((r) => !r.sentAt);
  const sent = (reminders.data ?? []).filter((r) => r.sentAt);
  return (
    <LargeTitleScrollView title="Reminders" back>
      <View style={styles.body}>
        {reminders.isError && !reminders.data ? (
          <ErrorState message={errorMessage(reminders.error)} onRetry={() => reminders.refetch()} />
        ) : upcoming.length || sent.length ? (
          <>
            {upcoming.length ? (
              <ListGroup header="Upcoming" footer="Reminders follow the event if its date changes. They arrive within about 10 minutes of the time.">
                {upcoming.map((r) => (
                  <ListRow
                    key={r.id}
                    icon="alarm"
                    iconColor={colors.blue}
                    title={r.event.title}
                    subtitle={`${reminderLabel(r.offsetMinutes)} · ${formatDateTimeIST(new Date(r.remindAt))}`}
                    onPress={() => router.push(`/event/${r.eventId}`)}
                    trailing={<IconButton icon="trash-outline" label={`Remove reminder for ${r.event.title}`} variant="plain" size={34} color={colors.red} onPress={() => remove.mutate(r.id)} />}
                  />
                ))}
              </ListGroup>
            ) : null}
            {sent.length ? (
              <ListGroup header="Sent">
                {sent.map((r) => (
                  <ListRow key={r.id} icon="checkmark" iconColor={colors.gray} title={r.event.title} subtitle={reminderLabel(r.offsetMinutes)} onPress={() => router.push(`/event/${r.eventId}`)} />
                ))}
              </ListGroup>
            ) : null}
          </>
        ) : reminders.isPending ? null : (
          <EmptyState icon="alarm-outline" title="No Reminders" message="On an event, tap Remind Me to choose when you’d like a reminder." />
        )}
      </View>
    </LargeTitleScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  skeleton: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  icon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 9, height: 9, borderRadius: 5 },
  flex: { flex: 1, minWidth: 0 },
});
