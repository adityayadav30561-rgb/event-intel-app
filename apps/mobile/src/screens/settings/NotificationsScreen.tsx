import { DEFAULT_NOTIFICATION_SETTINGS, NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPES, type NotificationSettings } from '@eii/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { OptionList } from '@/components/pickers/OptionList';
import { Button, ListGroup, ListRow, Sheet, showToast, Text, Toggle } from '@/components/ui';
import { useNotificationSettings, usePush, useSaveNotificationSettings } from '@/hooks/useAlerts';
import { errorMessage } from '@/lib/errors';
import type { PushStatus } from '@/platform/push';
import { accountRepository } from '@/repositories';
import { radius, spacing, useTheme } from '@/theme';

const QUIET_OPTIONS: { label: string; start: number; end: number }[] = [
  { label: 'Off', start: 0, end: 0 },
  { label: '9 PM – 8 AM', start: 21 * 60, end: 8 * 60 },
  { label: '10 PM – 7 AM', start: 22 * 60, end: 7 * 60 },
  { label: '11 PM – 7 AM', start: 23 * 60, end: 7 * 60 },
];
const quietLabel = (s: NotificationSettings) => QUIET_OPTIONS.find((o) => o.start === s.quietStart && o.end === s.quietEnd)?.label ?? 'Custom';

/** What to tell people about this device's alerts, and what they can do. */
const STATUS_TEXT: Record<PushStatus, { title: string; body: string }> = {
  on: { title: 'Alerts are on', body: 'This device gets alerts. Everything also stays in the inbox.' },
  off: { title: 'Alerts are off', body: 'Turn them on to hear about changes to events you follow, saved-search matches and reminders.' },
  denied: {
    title: 'Alerts are blocked',
    body:
      typeof navigator !== 'undefined' && /iPhone|iPad/i.test(navigator.userAgent)
        ? 'Open iPhone Settings → Notifications → Event Intel → Allow Notifications, then come back here.'
        : 'Allow notifications for this site in your browser’s site settings, then come back here.',
  },
  needs_install: { title: 'Add the app to your Home Screen first', body: 'iPhone sends alerts only to apps opened from the Home Screen. In Safari, tap Share → Add to Home Screen, then open Event Intel from there.' },
  unsupported: { title: 'This browser can’t show alerts', body: 'Use the app on iPhone (iOS 16.4 or later, from the Home Screen) or in Chrome. Alerts still appear in the inbox.' },
  unavailable: { title: 'Alerts aren’t available in this preview', body: 'Open the installed app to turn them on.' },
};

/** More → Notifications (§70, §137): this device's alerts, which types, and quiet hours. */
export function NotificationsScreen() {
  const { colors } = useTheme();
  const push = usePush();
  const settings = useNotificationSettings().data ?? DEFAULT_NOTIFICATION_SETTINGS;
  const save = useSaveNotificationSettings();
  const [quietOpen, setQuietOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const status = push.status ? STATUS_TEXT[push.status] : undefined;

  const sendTest = async () => {
    setTesting(true);
    try {
      await accountRepository.testPush();
      showToast('Test alert sent', 'notifications');
    } catch (error) {
      showToast(errorMessage(error), 'alert-circle');
    } finally {
      setTesting(false);
    }
  };

  const turnOn = async () => {
    try {
      await push.turnOn();
    } catch (error) {
      showToast(errorMessage(error), 'alert-circle');
    }
  };

  return (
    <>
      <LargeTitleScrollView title="Notifications" back>
        <View style={styles.body}>
          {status ? (
            <View style={[styles.status, { backgroundColor: colors.surface }]}>
              <Text variant="headline">{status.title}</Text>
              <Text variant="subheadline" tone="secondary">
                {status.body}
              </Text>
              {push.status === 'off' ? <Button title={push.busy ? 'Turning On…' : 'Turn On Alerts'} icon="notifications" block disabled={push.busy} onPress={turnOn} /> : null}
              {push.status === 'on' ? (
                <View style={styles.row}>
                  <Button title={testing ? 'Sending…' : 'Send a Test'} variant="tinted" style={styles.flex} disabled={testing} onPress={sendTest} />
                  <Button title="Turn Off" variant="gray" style={styles.flex} disabled={push.busy} onPress={() => void push.turnOff()} />
                </View>
              ) : null}
            </View>
          ) : null}

          <ListGroup header="Alert Me About" separatorInset={spacing.lg}>
            {NOTIFICATION_TYPES.map((type) => (
              <ListRow
                key={type}
                title={NOTIFICATION_TYPE_LABELS[type].title}
                subtitle={NOTIFICATION_TYPE_LABELS[type].detail}
                trailing={
                  <Toggle
                    value={settings.types[type]}
                    onValueChange={(on) => save.mutate({ ...settings, types: { ...settings.types, [type]: on } })}
                    accessibilityLabel={NOTIFICATION_TYPE_LABELS[type].title}
                  />
                }
              />
            ))}
          </ListGroup>

          <ListGroup footer="During quiet hours, alerts wait in the inbox. Cancellations, date changes and your own reminders still come through. At most three other alerts a day." separatorInset={spacing.lg}>
            <ListRow title="Quiet Hours" detail={quietLabel(settings)} onPress={() => setQuietOpen(true)} />
          </ListGroup>
        </View>
      </LargeTitleScrollView>
      <Sheet visible={quietOpen} onClose={() => setQuietOpen(false)} title="Quiet Hours">
        <OptionList
          groups={[{ options: QUIET_OPTIONS.map((o) => ({ value: o.label as string | null, label: o.label })) }]}
          selected={quietLabel(settings)}
          onSelect={(label) => {
            const option = QUIET_OPTIONS.find((o) => o.label === label);
            if (option) save.mutate({ ...settings, quietStart: option.start, quietEnd: option.end });
            setQuietOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.xxl },
  status: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  flex: { flex: 1 },
});
