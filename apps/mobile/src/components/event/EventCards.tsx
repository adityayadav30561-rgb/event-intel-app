import { EVENT_TYPE_LABELS, formatCountdown, type EventSummary } from '@eii/shared';
import { StyleSheet, View } from 'react-native';
import { Glass, PressableScale, Skeleton, Text } from '@/components/ui';
import { radius, shadow, spacing, useTheme } from '@/theme';
import { Artwork } from './Artwork';
import { endOf, openEvent, startOf, typeAndTopics, whenWhere } from './meta';
import { EventRelevanceBadge } from './RelevanceBadge';
import { StatusBadge } from './StatusBadge';

const a11y = (event: EventSummary) => `${event.title}, ${whenWhere(event, true)}`;

/** Large artwork card for the Home carousel, like the App Store's Today cards. */
export function FeaturedEventCard({ event, width }: { event: EventSummary; width: number }) {
  const countdown = formatCountdown(startOf(event), endOf(event));
  return (
    <PressableScale onPress={() => openEvent(event.id)} accessibilityRole="button" accessibilityLabel={a11y(event)} style={[styles.featured, shadow.card, { width }]}>
      <Artwork artwork={event.artwork} imageUrl={event.imageUrl} scrim style={StyleSheet.absoluteFill} />
      <View style={styles.featuredTop}>
        <Glass style={styles.glassChip} bordered>
          <Text variant="caption1Strong" tone="white">
            {EVENT_TYPE_LABELS[event.eventType]}
          </Text>
        </Glass>
        <StatusBadge status={event.status} onArtwork />
      </View>
      <View style={styles.featuredBottom}>
        <Text variant="title1" tone="white" numberOfLines={3}>
          {event.title}
        </Text>
        <Text variant="subheadlineStrong" style={styles.onArtSecondary} numberOfLines={1}>
          {whenWhere(event)}
          {countdown ? `  ·  ${countdown}` : ''}
        </Text>
      </View>
    </PressableScale>
  );
}

/** Medium card for horizontal shelves: artwork on top, text below. */
export function EventTile({ event, width = 240, note }: { event: EventSummary; width?: number; note?: string }) {
  return (
    <PressableScale onPress={() => openEvent(event.id)} accessibilityRole="button" accessibilityLabel={a11y(event)} style={[styles.tile, { width }]}>
      <View style={[styles.tileArt, shadow.card]}>
        <Artwork artwork={event.artwork} imageUrl={event.imageUrl} style={StyleSheet.absoluteFill} />
        {event.status !== 'upcoming' ? (
          <View style={styles.tileBadge}>
            <StatusBadge status={event.status} onArtwork />
          </View>
        ) : null}
      </View>
      <Text variant="headline" numberOfLines={2} style={styles.tileTitle}>
        {event.title}
      </Text>
      <Text variant="subheadline" tone="secondary" numberOfLines={1}>
        {whenWhere(event)}
      </Text>
      <EventRelevanceBadge event={event} />
      {note ? (
        <Text variant="footnote" tone="tertiary" numberOfLines={1}>
          {note}
        </Text>
      ) : null}
    </PressableScale>
  );
}

/**
 * Row for result lists: square artwork, title, when/where, type and topics.
 * `position` rounds the corners of the first and last rows so a list reads as one inset group.
 */
export function EventRow({ event, position = 'middle' }: { event: EventSummary; position?: 'first' | 'middle' | 'last' | 'only' }) {
  const { colors } = useTheme();
  const top = position === 'first' || position === 'only';
  const bottom = position === 'last' || position === 'only';
  return (
    <View
      style={[
        styles.rowWrap,
        { backgroundColor: colors.surface },
        top && { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: 4 },
        bottom && { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, paddingBottom: 4 },
      ]}
    >
      <PressableScale onPress={() => openEvent(event.id)} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={a11y(event)} style={styles.row}>
        <Artwork artwork={event.artwork} imageUrl={event.imageUrl} style={styles.rowArt} />
        <View style={styles.rowText}>
          <Text variant="headline" numberOfLines={2}>
            {event.title}
          </Text>
          <Text variant="subheadline" tone="secondary" numberOfLines={1}>
            {whenWhere(event)}
          </Text>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {typeAndTopics(event)}
          </Text>
          <EventRelevanceBadge event={event} />
          {event.status !== 'upcoming' ? (
            <View style={styles.rowBadge}>
              <StatusBadge status={event.status} />
            </View>
          ) : null}
        </View>
      </PressableScale>
      {!bottom ? <View style={[styles.rowSeparator, { backgroundColor: colors.separator }]} /> : null}
    </View>
  );
}

export const rowPosition = (index: number, count: number): 'first' | 'middle' | 'last' | 'only' =>
  count === 1 ? 'only' : index === 0 ? 'first' : index === count - 1 ? 'last' : 'middle';

// ── Skeletons ──────────────────────────────────────────────────────────────

export function FeaturedCardSkeleton({ width }: { width: number }) {
  const { colors } = useTheme();
  return <View style={[styles.featured, { width, backgroundColor: colors.tertiaryFill }]} />;
}

export function EventTileSkeleton({ width = 240 }: { width?: number }) {
  return (
    <View style={[styles.tile, { width }]}>
      <Skeleton height={width * 0.62} round={radius.lg} />
      <Skeleton width="85%" height={16} style={styles.skeletonGap} />
      <Skeleton width="55%" height={13} />
    </View>
  );
}

export function EventRowSkeleton({ position = 'middle' }: { position?: 'first' | 'middle' | 'last' | 'only' }) {
  const { colors } = useTheme();
  const top = position === 'first' || position === 'only';
  const bottom = position === 'last' || position === 'only';
  return (
    <View
      style={[
        styles.rowWrap,
        { backgroundColor: colors.surface },
        top && { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
        bottom && { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
      ]}
    >
      <View style={styles.row}>
        <Skeleton width={72} height={72} round={radius.md} />
        <View style={[styles.rowText, styles.skeletonText]}>
          <Skeleton width="90%" height={16} />
          <Skeleton width="60%" height={13} />
          <Skeleton width="40%" height={12} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  featured: { height: 420, borderRadius: radius.xl, overflow: 'hidden' },
  featuredTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: spacing.lg, gap: spacing.sm },
  featuredBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xl, gap: spacing.xs },
  glassChip: { paddingHorizontal: 10, height: 26, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.3)' },
  onArtSecondary: { color: 'rgba(255,255,255,0.88)' },
  tile: { gap: 3 },
  tileArt: { width: '100%', aspectRatio: 1.6, borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.sm },
  tileBadge: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  tileTitle: { marginTop: 1 },
  rowWrap: { marginHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  rowArt: { width: 72, height: 72, borderRadius: radius.md },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowBadge: { marginTop: 4 },
  rowSeparator: { height: StyleSheet.hairlineWidth, marginLeft: 96 },
  skeletonGap: { marginTop: 4 },
  skeletonText: { gap: 8 },
});
