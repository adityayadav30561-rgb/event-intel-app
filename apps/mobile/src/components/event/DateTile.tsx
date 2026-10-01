import { formatDayOfMonth, formatMonthShort } from '@eii/shared';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

/** Date tile in the style of the Calendar app icon: red month, large day. */
export function DateTile({ date, size = 50 }: { date: Date; size?: number }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size * 0.24, backgroundColor: scheme === 'dark' ? colors.surfaceSecondary : colors.backgroundPlain },
        scheme === 'light' && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text variant="caption2Strong" style={[styles.month, { color: colors.red, fontSize: size * 0.2, lineHeight: size * 0.26 }]}>
        {formatMonthShort(date)}
      </Text>
      <Text style={[styles.day, { fontSize: size * 0.46, lineHeight: size * 0.52, color: colors.label }]}>{formatDayOfMonth(date)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  month: { letterSpacing: 0.5 },
  day: { fontWeight: '400', marginTop: -2 },
});
