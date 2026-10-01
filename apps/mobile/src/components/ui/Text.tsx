import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { typography, useTheme, type ColorTokens, type TypographyVariant } from '@/theme';

export type TextTone =
  | 'label'
  | 'secondary'
  | 'tertiary'
  | 'tint'
  | 'onTint'
  | 'white'
  | 'red'
  | 'orange'
  | 'green'
  | 'indigo';

const toneColor = (c: ColorTokens, tone: TextTone) =>
  ({
    label: c.label,
    secondary: c.secondaryLabel,
    tertiary: c.tertiaryLabel,
    tint: c.tint,
    onTint: c.onTint,
    white: '#FFFFFF',
    red: c.red,
    orange: c.orange,
    green: c.green,
    indigo: c.indigo,
  })[tone];

export type TextProps = RNTextProps & { variant?: TypographyVariant; tone?: TextTone };

export function Text({ variant = 'body', tone = 'label', style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return <RNText {...rest} style={[typography[variant], { color: toneColor(colors, tone) }, style]} />;
}
