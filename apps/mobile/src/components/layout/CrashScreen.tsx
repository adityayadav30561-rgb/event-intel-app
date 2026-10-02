import { Ionicons } from '@expo/vector-icons';
import type { ErrorBoundaryProps } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { Button, Text } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

/**
 * Shown if a screen fails unexpectedly (spec §89): what happened in plain words, and a way out.
 * Your saved events, notes and queued changes are on the phone and unaffected.
 */
export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Ionicons name="warning-outline" size={44} color={colors.orange} />
      <Text variant="title2" style={styles.center}>
        Something went wrong
      </Text>
      <Text variant="body" tone="secondary" style={styles.center}>
        This screen couldn’t open. Your saved events, notes and changes are safe on this phone.
      </Text>
      <View style={styles.buttons}>
        <Button title="Try Again" size="large" block onPress={() => void retry()} />
        {Platform.OS === 'web' ? <Button title="Reload the App" variant="gray" block onPress={() => window.location.assign('/')} /> : null}
      </View>
      {__DEV__ ? (
        <Text variant="footnote" tone="tertiary" style={styles.center}>
          {error.message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  center: { textAlign: 'center', maxWidth: 420 },
  buttons: { width: '100%', maxWidth: 360, gap: spacing.md, marginTop: spacing.lg },
});
