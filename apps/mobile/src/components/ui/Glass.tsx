import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';

type Props = ViewProps & {
  style?: StyleProp<ViewStyle>;
  /** Thicker material for bars that sit over busy content. */
  strength?: 'regular' | 'thick';
  /** Hairline edge highlight, as on floating glass controls. */
  bordered?: boolean;
};

/**
 * Translucent glass material (blur + saturation), used for the tab bar, navigation bar and
 * floating buttons. On the web this is CSS backdrop-filter, which Safari renders natively.
 */
export function Glass({ style, strength = 'regular', bordered = true, children, ...rest }: Props) {
  const { colors, scheme } = useTheme();
  const border: ViewStyle = bordered ? { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder } : {};

  if (Platform.OS === 'web') {
    const blur = strength === 'thick' ? 'saturate(180%) blur(30px)' : 'saturate(180%) blur(20px)';
    const webStyle = { backgroundColor: colors.glass, backdropFilter: blur, WebkitBackdropFilter: blur } as ViewStyle;
    return (
      <View {...rest} style={[webStyle, border, style]}>
        {children}
      </View>
    );
  }
  return (
    <BlurView {...rest} intensity={strength === 'thick' ? 90 : 70} tint={scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} style={[border, style]}>
      {children}
    </BlurView>
  );
}
