import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '@/theme';
import { Text } from './Text';

/** Section title with an optional "See All", as on the App Store. Title-case, never an all-caps label. */
export function SectionHeader({ title, onSeeAll, seeAllLabel = 'See All' }: { title: string; onSeeAll?: () => void; seeAllLabel?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text variant="title2" accessibilityRole="header" style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${seeAllLabel}: ${title}`} style={({ pressed }) => [styles.seeAll, pressed && { opacity: 0.5 }]}>
          <Text variant="body" tone="tint">
            {seeAllLabel}
          </Text>
          <Ionicons name="chevron-forward" size={15} color={colors.tint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  title: { flex: 1 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 1 },
});
