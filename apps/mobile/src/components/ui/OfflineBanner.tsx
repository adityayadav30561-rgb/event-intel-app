import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnline } from '@/hooks/useOnline';
import { radius, shadow, spacing, TAB_BAR_HEIGHT, useTheme } from '@/theme';
import { Glass } from './Glass';
import { Text } from './Text';

/** Quiet capsule above the tab bar while offline; cached events stay usable (spec §80). */
export function OfflineBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  if (online) return null;
  return (
    <View
      style={[{ pointerEvents: 'none' }, styles.wrap, { bottom: TAB_BAR_HEIGHT + Math.max(insets.bottom, spacing.sm) + spacing.md }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Glass strength="thick" style={[styles.pill, shadow.floating]}>
        <Ionicons name="cloud-offline" size={16} color={colors.secondaryLabel} />
        <Text variant="footnoteStrong" tone="secondary">
          Offline · Showing saved events
        </Text>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 800 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, height: 36, borderRadius: radius.pill },
});
