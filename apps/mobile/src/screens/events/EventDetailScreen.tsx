import { Ionicons } from '@expo/vector-icons';
import {
  ATTENDANCE_LABELS,
  describeChange,
  EVENT_TYPE_LABELS,
  eventDayCount,
  formatDateRange,
  formatPrice,
  formatRelativePast,
  formatTime,
  formatTimeRange,
  formatLongDate,
  getCategory,
  getIndustry,
  getTechnology,
  type EventDetail,
} from '@eii/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Artwork, EventTile, RelevanceBadge, StatusBadge } from '@/components/event';
import { FloatingControls, goBack } from '@/components/layout/LargeTitle';
import { TrackingPanel } from '@/components/tracking/TrackingPanel';
import { Avatar, EmptyState, ErrorState, IconButton, ListGroup, ListRow, SectionHeader, Skeleton, Text } from '@/components/ui';
import { useRelevance } from '@/hooks/useAccount';
import { useEvent, useRelatedEvents } from '@/hooks/useEvents';
import { openDirections, openExternal } from '@/services/links';
import { analytics } from '@/services/analytics';
import { shareEvent } from '@/services/share';
import { radius, spacing, useTheme } from '@/theme';

const HERO = 320;
const useNativeDriver = Platform.OS !== 'web';

/** Event Detail (spec §29–41): what, when, where, who, why — and how to register. */
export function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useEvent(id);
  useEffect(() => {
    if (id) analytics.track('event_view');
  }, [id]);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [scrollY] = useState(() => new Animated.Value(0));

  if (event.isPending) return <DetailSkeleton />;
  if (event.isError || !event.data) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 60 }]}>
        {event.isError ? (
          <ErrorState onRetry={() => event.refetch()} />
        ) : (
          <EmptyState icon="calendar-clear-outline" title="Event Not Available" message="It may have been removed, or it's still waiting for verification." actionLabel="Go Back" onAction={goBack} />
        )}
        <View style={[styles.floatingBack, { top: insets.top + 7 }]}>
          <IconButton icon="chevron-back" label="Back" onPress={goBack} />
        </View>
      </View>
    );
  }

  const e = event.data;
  const heroHeight = HERO + insets.top;
  const heroTranslate = scrollY.interpolate({ inputRange: [-200, 0, heroHeight], outputRange: [-100, 0, heroHeight * 0.45], extrapolateRight: 'clamp' });
  const heroScale = scrollY.interpolate({ inputRange: [-200, 0], outputRange: [1.5, 1], extrapolateRight: 'clamp' });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.huge }}
      >
        <Animated.View style={{ height: heroHeight, transform: [{ translateY: heroTranslate }, { scale: heroScale }] }}>
          <Artwork artwork={e.artwork} imageUrl={e.imageUrl} style={StyleSheet.absoluteFill} />
        </Animated.View>

        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Header event={e} />
          <Actions event={e} />
          <KeyFacts event={e} />
          <TrackingPanel event={e} />
          <WhyItMatches event={e} />
          <Changes event={e} />
          <About event={e} />
          <Topics event={e} />
          <Audience event={e} />
          <Speakers event={e} />
          <Exhibitors event={e} />
          <Agenda event={e} />
          <Related id={e.id} />
          <Provenance event={e} />
        </View>
      </Animated.ScrollView>

      <FloatingControls back right={<IconButton icon="share-outline" label="Share" onPress={() => shareEvent(e)} />} />
    </View>
  );
}

// ── Sections ───────────────────────────────────────────────────────────────

function Header({ event: e }: { event: EventDetail }) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.badges}>
        <Text variant="subheadlineStrong" tone="secondary">
          {EVENT_TYPE_LABELS[e.eventType]}
        </Text>
        <StatusBadge status={e.status} />
        {e.isDemo ? (
          <View style={[styles.sampleBadge, { backgroundColor: colors.tertiaryFill }]} accessibilityLabel="Sample event, not a real listing">
            <Ionicons name="flask-outline" size={12} color={colors.secondaryLabel} />
            <Text variant="caption1Strong" tone="secondary">
              Sample
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="title1" accessibilityRole="header">
        {e.title}
      </Text>
      {e.organizer ? (
        <Pressable onPress={() => router.push(`/organizer/${e.organizer?.id}`)} accessibilityRole="link" hitSlop={6} style={styles.organizerLink}>
          <Text variant="body" tone="tint" numberOfLines={1}>
            {e.organizer.name}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.tint} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ActionButton({ icon, label, onPress, primary }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; primary?: boolean }) {
  const { colors } = useTheme();
  const fg = primary ? colors.onTint : colors.tint;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, { backgroundColor: primary ? colors.tint : colors.surface }, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={21} color={fg} />
      <Text variant="caption1Strong" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Like the action row on an Apple Maps place card. Only actions that work are shown. */
function Actions({ event: e }: { event: EventDetail }) {
  const open = e.status !== 'cancelled' && e.status !== 'completed';
  const canRegister = open && e.status !== 'registration_closed' && e.registrationUrl;
  const canDirect = e.attendanceMode !== 'online' && e.venue;
  return (
    <View style={styles.actions}>
      {canRegister ? <ActionButton primary icon="ticket" label="Register" onPress={() => openExternal(e.registrationUrl!)} /> : null}
      {e.officialWebsite ? <ActionButton icon="globe-outline" label="Website" onPress={() => openExternal(e.officialWebsite!)} /> : null}
      {canDirect ? <ActionButton icon="navigate" label="Directions" onPress={() => openDirections(e.venue!)} /> : null}
      <ActionButton icon="share-outline" label="Share" onPress={() => shareEvent(e)} />
    </View>
  );
}

function KeyFacts({ event: e }: { event: EventDetail }) {
  const { colors } = useTheme();
  const start = new Date(e.startAt);
  const end = new Date(e.endAt);
  const days = eventDayCount(start, end);
  const dateTitle = days === 1 ? formatLongDate(start) : formatDateRange(start, end);
  const timeLine = e.allDay ? (days > 1 ? `${days} days` : 'All day') : dailyHours(e, days);
  const price = formatPrice(e.price);
  return (
    <View style={styles.block}>
      <ListGroup>
        <ListRow icon="calendar" iconColor={colors.red} title={dateTitle} subtitle={timeLine} />
        {e.attendanceMode === 'online' ? (
          <ListRow icon="videocam" iconColor={colors.blue} title="Online Event" subtitle="Joining details come from the organizer after registration" />
        ) : e.venue ? (
          <ListRow icon="location" iconColor={colors.blue} title={e.venue.name} subtitle={e.venue.address} onPress={() => openDirections(e.venue!)} accessibilityLabel={`Venue: ${e.venue.name}. Get directions`} />
        ) : (
          <ListRow icon="location" iconColor={colors.blue} title={e.city} subtitle="Venue not announced yet" />
        )}
        {e.organizer ? (
          <ListRow icon="business" iconColor={colors.indigo} title={e.organizer.name} subtitle="Organizer" onPress={() => router.push(`/organizer/${e.organizer?.id}`)} />
        ) : null}
        <ListRow
          icon="pricetag"
          iconColor={colors.green}
          title={price ?? 'Price information unavailable'}
          subtitle={[e.price?.note && e.price.note !== price ? e.price.note : undefined, ATTENDANCE_LABELS[e.attendanceMode]].filter(Boolean).join(' · ')}
        />
      </ListGroup>
    </View>
  );
}

/** "9:30 AM – 5:30 PM IST" (plus day count for multi-day events). */
function dailyHours(e: EventDetail, days: number): string {
  const start = new Date(e.startAt);
  const end = new Date(e.endAt);
  // Some sources give a start time only; don't show a fake range like "10:00 AM – 10:00 AM".
  const hours =
    start.getTime() === end.getTime()
      ? `Starts ${formatTime(start)}`
      : days === 1
        ? formatTimeRange(start, end)
        : `${formatTime(start)} – ${formatTime(end)} daily`;
  return `${hours} IST${days > 1 ? ` · ${days} days` : ''}`;
}

/** "Why this event matches you" (Phase 4): the match level and its reasons, from your interests. */
function WhyItMatches({ event: e }: { event: EventDetail }) {
  const { colors } = useTheme();
  const relevance = useRelevance(e);
  if (!relevance) return null;
  return (
    <View style={styles.block}>
      <Text variant="title3" style={styles.blockTitle} accessibilityRole="header">
        Why It Matches You
      </Text>
      <View style={[styles.card, styles.matchCard, { backgroundColor: colors.surface }]}>
        <RelevanceBadge relevance={relevance} capsule />
        <View style={styles.reasons}>
          {relevance.reasons.map((reason) => (
            <View key={reason} style={styles.reason}>
              <Ionicons name="checkmark" size={16} color={colors.green} />
              <Text variant="body" style={styles.flexText}>
                {reason}
              </Text>
            </View>
          ))}
        </View>
        <Pressable onPress={() => router.push('/settings/interests')} accessibilityRole="link" hitSlop={8}>
          <Text variant="subheadline" tone="tint">
            Based on your interests
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Changes({ event: e }: { event: EventDetail }) {
  const { colors } = useTheme();
  if (!e.changes.length) return null;
  const recent = [...e.changes].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)).slice(0, 3);
  return (
    <View style={styles.block}>
      <ListGroup header="Updates">
        {recent.map((c) => (
          <ListRow
            key={c.id}
            icon={c.significance === 'critical' ? 'alert-circle' : 'sparkles'}
            iconColor={c.significance === 'critical' ? colors.red : colors.orange}
            title={describeChange(c)}
            subtitle={[c.previous && c.current && c.field !== 'status' ? `${c.previous} → ${c.current}` : c.field === 'speakers' ? c.current : undefined, formatRelativePast(new Date(c.detectedAt))]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
      </ListGroup>
    </View>
  );
}

function About({ event: e }: { event: EventDetail }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  if (!e.summary && !e.description) return null;
  return (
    <View style={styles.block}>
      <Text variant="title3" style={styles.blockTitle} accessibilityRole="header">
        About
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {e.summary ? <Text variant="body">{e.summary}</Text> : null}
        {e.description ? (
          <>
            <Text variant="callout" tone="secondary" numberOfLines={expanded ? undefined : 3} style={styles.description}>
              {e.description}
            </Text>
            <Pressable onPress={() => setExpanded((x) => !x)} accessibilityRole="button" hitSlop={8}>
              <Text variant="calloutStrong" tone="tint">
                {expanded ? 'Less' : 'More'}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

function Topics({ event: e }: { event: EventDetail }) {
  const { colors } = useTheme();
  const chips = [
    ...e.technologyIds.map((id) => ({ key: `t-${id}`, label: getTechnology(id)?.name, onPress: () => router.navigate({ pathname: '/explore', params: { q: getTechnology(id)?.name } }) })),
    ...e.categoryIds.map((id) => ({ key: `c-${id}`, label: getCategory(id)?.name, onPress: () => router.push(`/category/${id}`) })),
    ...e.industryIds.map((id) => ({ key: `i-${id}`, label: getIndustry(id)?.name, onPress: undefined })),
  ].filter((c) => c.label);
  if (!chips.length) return null;
  return (
    <View style={styles.block}>
      <Text variant="title3" style={styles.blockTitle} accessibilityRole="header">
        Topics
      </Text>
      <View style={styles.chipWrap}>
        {chips.map((c) => (
          <Pressable
            key={c.key}
            onPress={c.onPress}
            disabled={!c.onPress}
            accessibilityRole={c.onPress ? 'link' : 'text'}
            style={({ pressed }) => [styles.topic, { backgroundColor: colors.surface }, pressed && { opacity: 0.6 }]}
          >
            <Text variant="subheadline">{c.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Audience({ event: e }: { event: EventDetail }) {
  const { colors } = useTheme();
  if (!e.audience.length) return null;
  return (
    <View style={styles.block}>
      <ListGroup header="Who Attends">
        {e.audience.map((a) => (
          <ListRow key={a} title={a} leading={<Ionicons name="person-circle-outline" size={24} color={colors.secondaryLabel} />} />
        ))}
      </ListGroup>
    </View>
  );
}

function Speakers({ event: e }: { event: EventDetail }) {
  const { colors } = useTheme();
  if (!e.speakers.length) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title="Speakers" onSeeAll={e.speakers.length > 4 ? () => router.push(`/event/${e.id}/speakers`) : undefined} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
        {e.speakers.map((s) => (
          <View key={s.id} style={[styles.speaker, { backgroundColor: colors.surface }]} accessible accessibilityLabel={`${s.name}, ${s.designation ?? ''}, ${s.company ?? ''}`}>
            <Avatar name={s.name} size={60} />
            <Text variant="subheadlineStrong" numberOfLines={1} style={styles.centerText}>
              {s.name}
            </Text>
            <Text variant="footnote" tone="secondary" numberOfLines={2} style={styles.centerText}>
              {[s.designation, s.company].filter(Boolean).join(', ')}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Exhibitors({ event: e }: { event: EventDetail }) {
  if (!e.exhibitors.length) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title="Exhibitors" seeAllLabel={`All ${e.exhibitors.length}`} onSeeAll={e.exhibitors.length > 5 ? () => router.push(`/event/${e.id}/exhibitors`) : undefined} />
      <View style={styles.inset}>
        <ListGroup>
          {e.exhibitors.slice(0, 5).map((x) => (
            <ListRow key={x.id} title={x.company} subtitle={[x.booth, x.industry].filter(Boolean).join(' · ')} leading={<Avatar name={x.company} size={34} />} />
          ))}
        </ListGroup>
      </View>
    </View>
  );
}

function Agenda({ event: e }: { event: EventDetail }) {
  if (!e.agenda.length) return null;
  const days = new Set(e.agenda.map((a) => a.day)).size;
  const firstDay = e.agenda.filter((a) => a.day === 1).slice(0, 4);
  return (
    <View style={styles.section}>
      <SectionHeader title="Agenda" onSeeAll={() => router.push(`/event/${e.id}/agenda`)} seeAllLabel={days > 1 ? `${days} Days` : 'Full Agenda'} />
      <View style={styles.inset}>
        <ListGroup separatorInset={AGENDA_TEXT_INSET}>
          {firstDay.map((item) => (
            <AgendaRow key={item.id} time={formatTime(new Date(item.startsAt))} title={item.title} room={item.room} speaker={e.speakers.find((s) => item.speakerIds?.includes(s.id))?.name} />
          ))}
        </ListGroup>
      </View>
    </View>
  );
}

/** Separators in agenda lists start where the session title does. */
export const AGENDA_TEXT_INSET = spacing.lg + 76 + spacing.md;

export function AgendaRow({ time, end, title, room, speaker }: { time: string; end?: string; title: string; room?: string; speaker?: string }) {
  return (
    <View style={styles.agendaRow}>
      <View style={styles.agendaTime}>
        <Text variant="subheadlineStrong">{time}</Text>
        {end ? (
          <Text variant="footnote" tone="tertiary">
            {end}
          </Text>
        ) : null}
      </View>
      <View style={styles.flex}>
        <Text variant="body">{title}</Text>
        {room || speaker ? (
          <Text variant="subheadline" tone="secondary" numberOfLines={2}>
            {[speaker, room].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Related({ id }: { id: string }) {
  const related = useRelatedEvents(id);
  if (!related.data?.length) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title="You Might Also Like" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
        {related.data.map((r) => (
          <EventTile key={r.id} event={r} width={220} />
        ))}
      </ScrollView>
    </View>
  );
}

function Provenance({ event: e }: { event: EventDetail }) {
  const source = e.sources[0];
  const lines: ReactNode[] = [];
  if (source) lines.push(`Source: ${source.name}`, `Checked ${formatRelativePast(new Date(source.lastCheckedAt))}`);
  lines.push(`Last changed ${formatRelativePast(new Date(e.updatedAt))}`);
  return (
    <View style={styles.provenance}>
      <Text variant="footnote" tone="secondary" style={styles.centerText}>
        {lines.join(' · ')}
      </Text>
      {e.isDemo ? (
        <Text variant="footnote" tone="tertiary" style={styles.centerText}>
          This is a sample event for previewing the app. It isn’t a real listing; the organizer, venue and people are fictional.
        </Text>
      ) : null}
    </View>
  );
}

// ── Loading ────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={{ height: HERO + insets.top, backgroundColor: colors.tertiaryFill }} />
      <View style={[styles.sheet, styles.skeletonSheet, { backgroundColor: colors.background }]}>
        <Skeleton width={120} height={14} />
        <Skeleton width="90%" height={28} />
        <Skeleton width="60%" height={28} />
        <View style={styles.actions}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width={(Math.min(width, 720) - 32 - 30) / 4} height={60} round={radius.md} />
          ))}
        </View>
        <Skeleton height={200} round={radius.lg} />
      </View>
      <View style={[styles.floatingBack, { top: insets.top + 7 }]}>
        <IconButton icon="chevron-back" label="Back" onPress={goBack} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  floatingBack: { position: 'absolute', left: spacing.lg },
  sheet: { marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: spacing.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  skeletonSheet: { paddingHorizontal: spacing.lg, gap: spacing.md },
  header: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  sampleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 8, borderRadius: radius.pill },
  organizerLink: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  action: { flex: 1, height: 62, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 4 },
  block: { paddingHorizontal: spacing.lg, marginTop: spacing.xxl },
  blockTitle: { marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
  section: { marginTop: spacing.xxl },
  inset: { paddingHorizontal: spacing.lg },
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  matchCard: { gap: spacing.md },
  reasons: { gap: spacing.sm },
  reason: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flexText: { flex: 1, minWidth: 0 },
  description: { marginTop: spacing.xs },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  topic: { paddingHorizontal: 14, height: 36, borderRadius: radius.pill, justifyContent: 'center' },
  shelf: { paddingHorizontal: spacing.lg, gap: spacing.md },
  speaker: { width: 148, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', gap: 6 },
  centerText: { textAlign: 'center' },
  agendaRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.lg },
  agendaTime: { width: 76 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  provenance: { marginTop: spacing.xxxl, paddingHorizontal: spacing.xxl, gap: spacing.sm },
});
