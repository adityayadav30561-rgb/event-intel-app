import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing, useTheme } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

type StateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Smaller variant for use inside a section. */
  compact?: boolean;
};

/** Content-unavailable view, as in iOS: symbol, title, one line of help, optional action. */
export function EmptyState({ icon, title, message, actionLabel, onAction, compact }: StateProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.state, compact && styles.compact]} accessibilityRole="summary">
      <Ionicons name={icon} size={compact ? 34 : 48} color={colors.tertiaryLabel} />
      <Text variant={compact ? 'headline' : 'title3'} style={styles.center}>
        {title}
      </Text>
      {message ? (
        <Text variant="subheadline" tone="secondary" style={[styles.center, styles.message]}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button title={actionLabel} variant="tinted" onPress={onAction} style={styles.action} /> : null}
    </View>
  );
}

/** Error with a recovery action (spec §89). */
export function ErrorState({ title = "Couldn't Load", message = 'Check your connection and try again.', onRetry, compact }: { title?: string; message?: string; onRetry?: () => void; compact?: boolean }) {
  return <EmptyState icon="cloud-offline-outline" title={title} message={message} actionLabel={onRetry ? 'Try Again' : undefined} onAction={onRetry} compact={compact} />;
}

const useNativeDriver = Platform.OS !== 'web';

/** Shimmering placeholder block for skeleton loaders. */
export function Skeleton({ width = '100%', height = 14, round = radius.xs, style }: { width?: DimensionValue; height?: number; round?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver }),
        Animated.timing(pulse, { toValue: 0.55, duration: 750, useNativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ width, height, borderRadius: round, backgroundColor: colors.tertiaryFill, opacity: pulse }, style]} />;
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: 56, paddingHorizontal: spacing.xxxl },
  compact: { paddingVertical: spacing.xxl },
  center: { textAlign: 'center' },
  message: { maxWidth: 320 },
  action: { marginTop: spacing.md },
});
