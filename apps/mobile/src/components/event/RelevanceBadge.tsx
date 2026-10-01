import { Ionicons } from '@expo/vector-icons';
import { RELEVANCE_LABELS, type EventSummary, type Relevance, type RelevanceLevel } from '@eii/shared';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { useRelevance } from '@/hooks/useAccount';
import { radius, useTheme, type ColorTokens } from '@/theme';

const ICON: Record<RelevanceLevel, keyof typeof Ionicons.glyphMap> = { strong: 'star', good: 'checkmark-circle', possible: 'ellipse-outline' };
const tone = (c: ColorTokens, level: RelevanceLevel) => ({ strong: c.green, good: c.tint, possible: c.secondaryLabel })[level];

/**
 * How well an event fits your interests: Strong / Good / Possible match. No percentages (§10.1);
 * icon and words, never colour alone. Inline in rows; `capsule` on the event page.
 */
export function RelevanceBadge({ relevance, capsule }: { relevance: Relevance | undefined; capsule?: boolean }) {
  const { colors } = useTheme();
  if (!relevance) return null;
  const color = tone(colors, relevance.level);
  return (
    <View style={[styles.row, capsule && [styles.capsule, { backgroundColor: `${color}1F` }]]} accessibilityLabel={RELEVANCE_LABELS[relevance.level]}>
      <Ionicons name={ICON[relevance.level]} size={capsule ? 14 : 12} color={color} />
      <Text variant={capsule ? 'subheadlineStrong' : 'footnoteStrong'} style={{ color }} numberOfLines={1}>
        {RELEVANCE_LABELS[relevance.level]}
      </Text>
    </View>
  );
}

/** The badge for an event, scored against the signed-in person's interests. */
export function EventRelevanceBadge({ event }: { event: EventSummary }) {
  return <RelevanceBadge relevance={useRelevance(event)} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  capsule: { paddingHorizontal: 10, height: 26, borderRadius: radius.pill, gap: 5 },
});
