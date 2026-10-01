import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { radius, useTheme } from '@/theme';
import { Text } from './Text';

type Props = {
  label: string;
  selected?: boolean;
  /** Shows a chevron: the chip opens a picker. */
  menu?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
};

/** Capsule filter control. Selected chips are filled with the tint; state is never shown by colour alone. */
export function Chip({ label, selected, menu, icon, onPress }: Props) {
  const { colors } = useTheme();
  const fg = selected ? colors.onTint : colors.label;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      aria-selected={selected}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? colors.tint : colors.tertiaryFill },
        pressed && { opacity: 0.7 },
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={fg} /> : null}
      <Text variant="subheadlineStrong" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
      {menu ? <Ionicons name="chevron-down" size={13} color={fg} style={styles.chevron} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 14, borderRadius: radius.pill },
  chevron: { marginLeft: 1, marginTop: 1 },
});
