import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { Glass, Text } from '@/components/ui';
import { radius, shadow, useTheme } from '@/theme';

/** Glass capsule showing the selected location; opens the place picker. */
export function PlaceButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Location: ${label}. Change location`} style={({ pressed }) => pressed && styles.pressed}>
      <Glass style={[styles.pill, shadow.floating]}>
        <Ionicons name="location" size={15} color={colors.tint} />
        <Text variant="subheadlineStrong" numberOfLines={1} style={styles.label}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={13} color={colors.secondaryLabel} />
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 38, paddingHorizontal: 14, borderRadius: radius.pill, maxWidth: 190 },
  label: { flexShrink: 1 },
  pressed: { opacity: 0.6 },
});
