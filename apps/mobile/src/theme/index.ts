import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type ColorTokens } from './colors';

export * from './colors';
export * from './tokens';

export type Theme = { scheme: 'light' | 'dark'; colors: ColorTokens };

const light: Theme = { scheme: 'light', colors: lightColors };
const dark: Theme = { scheme: 'dark', colors: darkColors };

/** Current theme, following the phone's light/dark setting. */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Builds theme-aware styles once per theme: `const styles = useStyles(makeStyles)`. */
export function useStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
