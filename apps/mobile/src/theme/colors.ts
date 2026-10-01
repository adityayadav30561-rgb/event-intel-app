/**
 * iOS system colours (Human Interface Guidelines), light and dark.
 * Semantic names follow UIKit so the app reads like a native Apple app.
 */
export type ColorTokens = {
  /** Grouped background behind cards and inset lists. */
  background: string;
  /** Plain full-bleed background. */
  backgroundPlain: string;
  /** Cards and inset-grouped rows. */
  surface: string;
  /** Nested surfaces inside a card. */
  surfaceSecondary: string;
  label: string;
  secondaryLabel: string;
  tertiaryLabel: string;
  quaternaryLabel: string;
  separator: string;
  opaqueSeparator: string;
  fill: string;
  secondaryFill: string;
  tertiaryFill: string;
  quaternaryFill: string;
  tint: string;
  tintPressed: string;
  /** Tint at low opacity, for "tinted" buttons and selected chips. */
  tintSoft: string;
  onTint: string;
  red: string;
  orange: string;
  yellow: string;
  green: string;
  teal: string;
  blue: string;
  indigo: string;
  purple: string;
  pink: string;
  gray: string;
  /** Glass material for floating bars and buttons. */
  glass: string;
  glassBorder: string;
  glassHighlight: string;
  overlay: string;
  shadow: string;
};

export const lightColors: ColorTokens = {
  background: '#F2F2F7',
  backgroundPlain: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSecondary: '#F2F2F7',
  label: '#000000',
  secondaryLabel: 'rgba(60,60,67,0.6)',
  tertiaryLabel: 'rgba(60,60,67,0.3)',
  quaternaryLabel: 'rgba(60,60,67,0.18)',
  separator: 'rgba(60,60,67,0.29)',
  opaqueSeparator: '#C6C6C8',
  fill: 'rgba(120,120,128,0.2)',
  secondaryFill: 'rgba(120,120,128,0.16)',
  tertiaryFill: 'rgba(118,118,128,0.12)',
  quaternaryFill: 'rgba(116,116,128,0.08)',
  tint: '#007AFF',
  tintPressed: '#0062CC',
  tintSoft: 'rgba(0,122,255,0.12)',
  onTint: '#FFFFFF',
  red: '#FF3B30',
  orange: '#FF9500',
  yellow: '#FFCC00',
  green: '#34C759',
  teal: '#30B0C7',
  blue: '#007AFF',
  indigo: '#5856D6',
  purple: '#AF52DE',
  pink: '#FF2D55',
  gray: '#8E8E93',
  glass: 'rgba(255,255,255,0.72)',
  glassBorder: 'rgba(255,255,255,0.7)',
  glassHighlight: 'rgba(0,0,0,0.06)',
  overlay: 'rgba(0,0,0,0.4)',
  shadow: '#000000',
};

export const darkColors: ColorTokens = {
  background: '#000000',
  backgroundPlain: '#000000',
  surface: '#1C1C1E',
  surfaceSecondary: '#2C2C2E',
  label: '#FFFFFF',
  secondaryLabel: 'rgba(235,235,245,0.6)',
  tertiaryLabel: 'rgba(235,235,245,0.3)',
  quaternaryLabel: 'rgba(235,235,245,0.16)',
  separator: 'rgba(84,84,88,0.65)',
  opaqueSeparator: '#38383A',
  fill: 'rgba(120,120,128,0.36)',
  secondaryFill: 'rgba(120,120,128,0.32)',
  tertiaryFill: 'rgba(118,118,128,0.24)',
  quaternaryFill: 'rgba(118,118,128,0.18)',
  tint: '#0A84FF',
  tintPressed: '#409CFF',
  tintSoft: 'rgba(10,132,255,0.2)',
  onTint: '#FFFFFF',
  red: '#FF453A',
  orange: '#FF9F0A',
  yellow: '#FFD60A',
  green: '#30D158',
  teal: '#40C8E0',
  blue: '#0A84FF',
  indigo: '#5E5CE6',
  purple: '#BF5AF2',
  pink: '#FF375F',
  gray: '#8E8E93',
  glass: 'rgba(40,40,42,0.62)',
  glassBorder: 'rgba(255,255,255,0.12)',
  glassHighlight: 'rgba(255,255,255,0.08)',
  overlay: 'rgba(0,0,0,0.6)',
  shadow: '#000000',
};
