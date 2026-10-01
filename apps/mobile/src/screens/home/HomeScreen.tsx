import { Ionicons } from '@expo/vector-icons';
import { describeChange, describePreferences, formatRelativePast, getCategory, greetingFor, hasPreferences, STATUS_LABELS, type EventSummary, type HomeFeed } from '@eii/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  Artwork,
  CompactEventRow,
  EventTile,
  EventTileSkeleton,
  FeaturedCardSkeleton,
  FeaturedEventCard,
  openEvent,
} from '@/components/event';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { PlaceButton } from '@/components/pickers/PlaceButton';
import { PlaceSheet } from '@/components/pickers/PlaceSheet';
import { ErrorState, ListGroup, PressableScale, SearchField, SectionHeader, Skeleton, Text } from '@/components/ui';
import { useForYou, usePreferences } from '@/hooks/useAccount';
import { useHomeFeed, useIsSampleData } from '@/hooks/useEvents';
import { placeCityIds, placeName, usePlaceStore, type Place } from '@/store/placeStore';
import { radius, shadow, spacing, useTheme } from '@/theme';

const MAX_CONTENT = 720;

/** Home — the command center (spec §9–13). */
export function HomeScreen() {
  const { width } = useWindowDimensions();
  const place = usePlaceStore((s) => s.place);
  const setPlace = usePlaceStore((s) => s.setPlace);
  const [placeOpen, setPlaceOpen] = useState(false);
  const feed = useHomeFeed({ cityIds: placeCityIds(place) });
  const contentWidth = Math.min(width, MAX_CONTENT);
  const featuredWidth = Math.min(contentWidth - spacing.lg * 2 - 20, 440);

  return (
    <>
      <LargeTitleScrollView
        title={greetingFor()}
        tabRoot
        headerRight={<PlaceButton label={placeName(place)} onPress={() => setPlaceOpen(true)} />}
        accessory={
          <SearchField
            asButton
            placeholder="Search events, SAP, Odoo, ERP…"
            onPress={() => router.navigate({ pathname: '/explore', params: { focus: String(Date.now()) } })}
          />
        }
        contentStyle={styles.content}
      >
        {feed.isError && !feed.data ? (
          <ErrorState onRetry={() => feed.refetch()} />
        ) : (
          <HomeSections feed={feed.data} loading={feed.isPending} featuredWidth={featuredWidth} tileWidth={(contentWidth - spacing.lg * 2 - spacing.md) / 2} place={place} onChangePlace={() => setPlaceOpen(true)} />
        )}
      </LargeTitleScrollView>
      <PlaceSheet visible={placeOpen} onClose={() => setPlaceOpen(false)} value={place} onChange={(p) => p && setPlace(p)} />
    </>
  );
}

function HomeSections({ feed, loading, featuredWidth, tileWidth, place, onChangePlace }: { feed?: HomeFeed; loading: boolean; featuredWidth: number; tileWidth: number; place: Place; onChangePlace: () => void }) {
  const { colors } = useTheme();
  const isSampleData = useIsSampleData();
  const nothingAtAll = feed && !feed.upcoming.length && !feed.thisWeek.length && !feed.newlyAdded.length;

  if (nothingAtAll) {
    return (
      <View style={styles.section}>
        <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
          <Ionicons name="calendar-clear-outline" size={40} color={colors.tertiaryLabel} />
          <Text variant="title3" style={styles.center}>
            No Upcoming Events in {placeName(place)}
          </Text>
          <Text variant="subheadline" tone="secondary" style={styles.center}>
            Try a nearby city or all of India.
          </Text>
          <Pressable onPress={onChangePlace} accessibilityRole="button" hitSlop={8}>
            <Text variant="headline" tone="tint">
              Change Location
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <>
      {/* Coming up: featured carousel */}
      <View style={styles.section}>
        <SectionHeader title="Coming Up" onSeeAll={() => router.push('/browse/upcoming')} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={featuredWidth + spacing.md}
          decelerationRate="fast"
          contentContainerStyle={styles.shelf}
        >
          {loading || !feed
            ? [0, 1].map((i) => <FeaturedCardSkeleton key={i} width={featuredWidth} />)
            : feed.upcoming.map((event) => <FeaturedEventCard key={event.id} event={event} width={featuredWidth} />)}
        </ScrollView>
      </View>

      <ForYouSection />

      {/* This week */}
      <View style={styles.section}>
        <SectionHeader title="This Week" onSeeAll={feed && feed.thisWeek.length > 4 ? () => router.push('/browse/this-week') : undefined} />
        <View style={styles.inset}>
          {loading || !feed ? (
            <ListGroup>
              {[0, 1, 2].map((i) => (
                <RowSkeleton key={i} />
              ))}
            </ListGroup>
          ) : feed.thisWeek.length ? (
            <ListGroup>
              {feed.thisWeek.slice(0, 4).map((event) => (
                <CompactEventRow key={event.id} event={event} />
              ))}
            </ListGroup>
          ) : (
            <View style={[styles.quietCard, { backgroundColor: colors.surface }]}>
              <Text variant="subheadline" tone="secondary">
                Nothing scheduled for the rest of this week.
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Newly discovered */}
      {loading || (feed && feed.newlyAdded.length > 0) ? (
        <View style={styles.section}>
          <SectionHeader title="Newly Discovered" onSeeAll={() => router.push('/browse/new')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
            {loading || !feed
              ? [0, 1, 2].map((i) => <EventTileSkeleton key={i} />)
              : feed.newlyAdded.map((event) => <EventTile key={event.id} event={event} note={`Added ${formatRelativePast(new Date(event.createdAt))}`} />)}
          </ScrollView>
        </View>
      ) : null}

      {/* Recently updated */}
      {feed && feed.recentlyUpdated.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Recently Updated" onSeeAll={() => router.push('/browse/updated')} />
          <View style={styles.inset}>
            <ListGroup>
              {feed.recentlyUpdated.map((event) => (
                <UpdatedRow key={event.id} event={event} />
              ))}
            </ListGroup>
          </View>
        </View>
      ) : null}

      {/* Categories */}
      {feed && feed.categories.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Browse by Category" />
          <View style={styles.grid}>
            {feed.categories.map(({ id, count }) => (
              <CategoryTile key={id} id={id} count={count} width={tileWidth} />
            ))}
          </View>
        </View>
      ) : null}

      {isSampleData && feed ? (
        <Text variant="footnote" tone="tertiary" style={styles.sampleNote}>
          These are sample events for previewing the app. Live event data replaces them in a later update.
        </Text>
      ) : null}
    </>
  );
}

/** "Events you may want to track" (Phase 4): best matches for your interests, with the reason. */
function ForYouSection() {
  const { colors } = useTheme();
  const prefs = usePreferences();
  const forYou = useForYou();
  const interests = describePreferences(prefs.data);

  if (prefs.data && !hasPreferences(prefs.data)) {
    return (
      <View style={styles.section}>
        <SectionHeader title="For You" />
        <View style={styles.inset}>
          <View style={[styles.promptCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="sparkles" size={26} color={colors.tint} />
            <Text variant="headline">Events picked for you</Text>
            <Text variant="subheadline" tone="secondary">
              Choose what you follow, like SAP, Manufacturing or Hyderabad, and the best matches appear here with the reasons.
            </Text>
            <Pressable onPress={() => router.push('/settings/interests')} accessibilityRole="button" hitSlop={8}>
              <Text variant="headline" tone="tint">
                Choose Interests
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const items = forYou.data ?? [];
  if (!forYou.isPending && !items.length) {
    if (!prefs.data) return null;
    return (
      <View style={styles.section}>
        <SectionHeader title="For You" onSeeAll={() => router.push('/settings/interests')} seeAllLabel="Interests" />
        <View style={styles.inset}>
          <View style={[styles.quietCard, { backgroundColor: colors.surface }]}>
            <Text variant="subheadline" tone="secondary">
              No upcoming events match {interests ?? 'your interests'} yet. New events are checked twice a day.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHeader title="For You" onSeeAll={() => router.push('/settings/interests')} seeAllLabel="Interests" />
      {interests ? (
        <Text variant="subheadline" tone="secondary" numberOfLines={1} style={styles.sectionNote}>
          Because you follow {interests}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
        {forYou.isPending && !forYou.data
          ? [0, 1, 2].map((i) => <EventTileSkeleton key={i} />)
          : items.map((event) => <EventTile key={event.id} event={event} note={event.relevance.reasons.slice(0, 2).join(' · ')} />)}
      </ScrollView>
    </View>
  );
}

/** Status changes read as the new status ("Postponed"), other changes by field ("Venue changed"). */
function changeText(event: EventSummary): string {
  const change = event.lastChange;
  if (!change) return 'Updated';
  if (change.field === 'status' || (change.field === 'registration' && event.status === 'registration_closed')) return STATUS_LABELS[event.status];
  return describeChange(change);
}

function UpdatedRow({ event }: { event: EventSummary }) {
  const { colors } = useTheme();
  const change = event.lastChange;
  const critical = event.status === 'cancelled' || event.status === 'postponed';
  return (
    <Pressable
      onPress={() => openEvent(event.id)}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}. ${changeText(event)}`}
      style={({ pressed }) => [styles.updatedRow, pressed && { backgroundColor: colors.quaternaryFill }]}
    >
      <Artwork artwork={event.artwork} imageUrl={event.imageUrl} style={styles.updatedArt} />
      <View style={styles.flex}>
        <Text variant="headline" numberOfLines={2}>
          {event.title}
        </Text>
        <View style={styles.changeLine}>
          <Ionicons name={critical ? 'alert-circle' : 'sparkles'} size={14} color={critical ? colors.red : colors.orange} />
          <Text variant="subheadline" tone="secondary" numberOfLines={1} style={styles.flex}>
            {change ? `${changeText(event)} · ${formatRelativePast(new Date(change.detectedAt))}` : 'Updated'}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.tertiaryLabel} />
    </Pressable>
  );
}

function CategoryTile({ id, count, width }: { id: string; count: number; width: number }) {
  const category = getCategory(id);
  if (!category) return null;
  return (
    <PressableScale onPress={() => router.push(`/category/${id}`)} accessibilityRole="button" accessibilityLabel={`${category.name}, ${count} events`} style={[styles.categoryTile, shadow.card, { width }]}>
      <Artwork artwork={{ palette: category.palette, seed: id.length * 7919 }} style={StyleSheet.absoluteFill} />
      <Ionicons name={category.icon as keyof typeof Ionicons.glyphMap} size={22} color="#FFFFFF" />
      <View>
        <Text variant="headline" tone="white" numberOfLines={2}>
          {category.name}
        </Text>
        <Text variant="footnoteStrong" style={styles.categoryCount}>
          {count} {count === 1 ? 'event' : 'events'}
        </Text>
      </View>
    </PressableScale>
  );
}

function RowSkeleton() {
  return (
    <View style={styles.skeletonRow}>
      <Skeleton width={50} height={50} round={12} />
      <View style={styles.skeletonText}>
        <Skeleton width="80%" height={16} />
        <Skeleton width="45%" height={13} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: MAX_CONTENT, width: '100%', alignSelf: 'center' },
  section: { marginTop: spacing.xxl },
  shelf: { paddingHorizontal: spacing.lg, gap: spacing.md },
  inset: { paddingHorizontal: spacing.lg },
  quietCard: { borderRadius: radius.lg, padding: spacing.lg },
  promptCard: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, alignItems: 'flex-start' },
  sectionNote: { paddingHorizontal: spacing.lg, marginTop: -spacing.xs, marginBottom: spacing.md },
  emptyCard: { marginHorizontal: spacing.lg, borderRadius: radius.xl, padding: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  center: { textAlign: 'center' },
  updatedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.lg },
  updatedArt: { width: 44, height: 44, borderRadius: 10 },
  changeLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  flex: { flex: 1, minWidth: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.lg, gap: spacing.md },
  categoryTile: { height: 116, borderRadius: radius.lg, overflow: 'hidden', padding: spacing.md, justifyContent: 'space-between' },
  categoryCount: { color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  sampleNote: { textAlign: 'center', marginTop: spacing.xxxl, paddingHorizontal: spacing.xxxl },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  skeletonText: { flex: 1, gap: 8 },
});
