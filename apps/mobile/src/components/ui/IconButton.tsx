import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { shadow, touchTarget, useTheme } from '@/theme';
import { Glass } from './Glass';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  /** glass: floating round glass button · fill: round gray fill · plain: icon only. */
  variant?: 'glass' | 'fill' | 'plain';
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

/** Round icon button, as in Apple's current navigation bars. */
export function IconButton({ icon, label, onPress, variant = 'glass', size = 38, color, style }: Props) {
  const { colors } = useTheme();
  const tint = color ?? colors.label;
  const inner = <Ionicons name={icon} size={Math.round(size * 0.5)} color={tint} />;
  const box: ViewStyle = { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' };
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={(touchTarget - size) / 2 > 0 ? (touchTarget - size) / 2 : 0}
      style={({ pressed }) => [pressed && styles.pressed, style]}
    >
      {variant === 'glass' ? (
        <Glass style={[box, shadow.floating]}>{inner}</Glass>
      ) : (
        <View style={[box, variant === 'fill' && { backgroundColor: colors.tertiaryFill }]}>{inner}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({ pressed: { opacity: 0.6, transform: [{ scale: 0.94 }] } });
