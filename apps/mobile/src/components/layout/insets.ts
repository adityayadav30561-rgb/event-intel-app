import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, TAB_BAR_HEIGHT } from '@/theme';

/** Bottom space content must leave so it can scroll clear of the floating tab bar. */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, spacing.sm) + spacing.xxl;
}

/** Height of the row above the large title that holds controls (back, location). */
export function useHeaderRowHeight(): number {
  return 52;
}
