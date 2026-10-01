import { getCategory, type EventQuery, type EventSummary } from '@eii/shared';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { EventRow, EventRowSkeleton, rowPosition } from '@/components/event';
import { LargeTitleFlatList } from '@/components/layout/LargeTitle';
import { EmptyState, ErrorState, Text } from '@/components/ui';
import { useEventSearch } from '@/hooks/useEvents';
import { placeCityIds, placeName, usePlaceStore } from '@/store/placeStore';
import { spacing, useTheme } from '@/theme';

const SECTIONS: Record<string, { title: string; query: Omit<EventQuery, 'cityIds'> }> = {
  upcoming: { title: 'Coming Up', query: { sort: 'date' } },
  'this-week': { title: 'This Week', query: { datePreset: 'this_week', sort: 'date' } },
  new: { title: 'Newly Discovered', query: { sort: 'recently_added' } },
  updated: { title: 'Recently Updated', query: { sort: 'recently_updated' } },
};

/** "See All" lists from Home, and category pages. Respects the location chosen on Home. */
function EventListScreen({ title, query }: { title: string; query: Omit<EventQuery, 'cityIds'> }) {
  const { colors } = useTheme();
  const place = usePlaceStore((s) => s.place);
  const fullQuery = useMemo(() => ({ ...query, cityIds: placeCityIds(place) }), [query, place]);
  const results = useEventSearch(fullQuery);
  const items = useMemo(() => results.data?.pages.flatMap((p) => p.items) ?? [], [results.data]);
  const total = results.data?.pages[0]?.total;

  return (
    <LargeTitleFlatList<EventSummary>
      title={title}
      back
      listHeader={
        <Text variant="subheadline" tone="secondary" style={styles.sub}>
          {placeName(place)}
          {total !== undefined ? ` · ${total} ${total === 1 ? 'event' : 'events'}` : ''}
        </Text>
      }
      data={items}
      keyExtractor={(e) => e.id}
      renderItem={({ item, index }) => <EventRow event={item} position={rowPosition(index, items.length)} />}
      onEndReached={() => results.hasNextPage && !results.isFetchingNextPage && results.fetchNextPage()}
      onEndReachedThreshold={0.6}
      ListEmptyComponent={
        results.isPending ? (
          <View>
            {[0, 1, 2, 3, 4].map((i) => (
              <EventRowSkeleton key={i} position={rowPosition(i, 5)} />
            ))}
          </View>
        ) : results.isError ? (
          <ErrorState onRetry={() => results.refetch()} />
        ) : (
          <EmptyState icon="calendar-clear-outline" title="Nothing Here Yet" message={`No events in ${placeName(place)} for this list. Try changing the location on Home.`} />
        )
      }
      ListFooterComponent={results.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.secondaryLabel} /> : null}
    />
  );
}

export function BrowseScreen() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const config = SECTIONS[section ?? ''] ?? SECTIONS.upcoming!;
  return <EventListScreen title={config.title} query={config.query} />;
}

export function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useMemo(() => ({ categoryIds: id ? [id] : undefined, sort: 'date' as const }), [id]);
  return <EventListScreen title={getCategory(id ?? '')?.name ?? 'Category'} query={query} />;
}

const styles = StyleSheet.create({
  sub: { paddingHorizontal: spacing.lg + spacing.xs, paddingBottom: spacing.md },
  footer: { paddingVertical: spacing.xl },
});
