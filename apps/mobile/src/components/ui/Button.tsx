import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, useTheme } from '@/theme';
import { Text } from './Text';

type Variant = 'filled' | 'tinted' | 'gray' | 'plain';
type Size = 'small' | 'medium' | 'large';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  block?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const metrics: Record<Size, { height: number; padding: number; radius: number; icon: number }> = {
  small: { height: 30, padding: 12, radius: radius.pill, icon: 15 },
  medium: { height: 40, padding: 16, radius: radius.pill, icon: 17 },
  large: { height: 52, padding: 20, radius: radius.md, icon: 19 },
};

/** iOS button styles: filled, tinted, gray and plain. */
export function Button({ title, onPress, variant = 'filled', size = 'medium', icon, block, disabled, accessibilityLabel, style }: Props) {
  const { colors } = useTheme();
  const m = metrics[size];
  const background = { filled: colors.tint, tinted: colors.tintSoft, gray: colors.tertiaryFill, plain: 'transparent' }[variant];
  const foreground = variant === 'filled' ? colors.onTint : colors.tint;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        { minHeight: m.height, paddingHorizontal: variant === 'plain' ? 4 : m.padding, borderRadius: m.radius, backgroundColor: background },
        block && styles.block,
        pressed && { opacity: 0.6 },
        disabled && { opacity: 0.35 },
        style,
      ]}
    >
      <View style={styles.row}>
        {icon ? <Ionicons name={icon} size={m.icon} color={foreground} /> : null}
        <Text variant={size === 'small' ? 'subheadlineStrong' : size === 'large' ? 'headline' : 'calloutStrong'} style={{ color: foreground }}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  block: { alignSelf: 'stretch' },
});
