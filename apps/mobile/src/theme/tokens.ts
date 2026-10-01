import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * The system font: San Francisco on iPhone (in Safari and natively), Roboto on Android.
 * Apple's font applies its own size-specific tracking, so no letter-spacing is set here.
 */
export const fontFamily = Platform.select({
  web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});

const style = (fontSize: number, lineHeight: number, fontWeight: TextStyle['fontWeight']): TextStyle => ({
  fontFamily,
  fontSize,
  lineHeight,
  fontWeight,
});

/** Apple's text styles (HIG, default Dynamic Type size). */
export const typography = {
  largeTitle: style(34, 41, '700'),
  title1: style(28, 34, '700'),
  title2: style(22, 28, '700'),
  title3: style(20, 25, '600'),
  headline: style(17, 22, '600'),
  body: style(17, 22, '400'),
  callout: style(16, 21, '400'),
  calloutStrong: style(16, 21, '600'),
  subheadline: style(15, 20, '400'),
  subheadlineStrong: style(15, 20, '600'),
  footnote: style(13, 18, '400'),
  footnoteStrong: style(13, 18, '600'),
  caption1: style(12, 16, '400'),
  caption1Strong: style(12, 16, '600'),
  caption2: style(11, 13, '400'),
  caption2Strong: style(11, 13, '600'),
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

/** 4-point grid; 16 is the standard iPhone margin. */
export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 44 } as const;

export const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 26, xxl: 32, pill: 999 } as const;

/** Minimum touch target (HIG). */
export const touchTarget = 44;

/** Floating tab bar height (excluding the home-indicator inset). */
export const TAB_BAR_HEIGHT = 62;

const webShadow = (value: string) => ({ boxShadow: value }) as ViewStyle;

export const shadow = {
  /** Soft lift for artwork cards. */
  card: Platform.select<ViewStyle>({
    web: webShadow('0 1px 2px rgba(0,0,0,0.06), 0 6px 18px rgba(0,0,0,0.08)'),
    default: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  }),
  /** Floating glass controls. */
  floating: Platform.select<ViewStyle>({
    web: webShadow('0 8px 30px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)'),
    default: { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  }),
};

export const motion = {
  /** Press feedback scale for cards. */
  pressScale: 0.97,
};
