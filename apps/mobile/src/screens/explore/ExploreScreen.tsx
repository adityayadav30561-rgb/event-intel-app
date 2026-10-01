import { Ionicons } from '@expo/vector-icons';
import { DATE_PRESET_LABELS, EVENT_TYPE_LABELS, getCategory, type EventSummary } from '@eii/shared';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { EventRow, EventRowSkeleton, rowPosition } from '@/components/event';
import { LargeTitleFlatList } from '@/components/layout/LargeTitle';
import { CategorySheet, DateSheet, EventTypeSheet } from '@/components/pickers/FilterSheets';
import { PlaceSheet } from '@/components/pickers/PlaceSheet';
import { Chip, EmptyState, ErrorState, ListGroup, SearchField, Text } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useEventSearch } from '@/hooks/useEvents';
import { useExploreStore } from '@/store/exploreStore';
import { placeCityIds, placeName } from '@/store/placeStore';
import { spacing, useTheme } from '@/theme';

const SUGGESTIONS = ['SAP', 'Odoo', 'ERP', 'Manufacturing', 'AI', 'Cybersecurity', 'Cloud', 'HRMS', 'Supply Chain'];

type Picker = 'place' | 'date' | 'category' | 'type' | null;

/** Explore — search and filter every upcoming event (spec §14–19). */
export function ExploreScreen() {
  const { colors } = useTheme();
  const filters = useExploreStore();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const input = useRef<TextInput>(null);
  const [text, setText] = useState(filters.q);
  const [focused, setFocused] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const q = useDebouncedValue(text.trim(), 250);

  // Home's search field opens Explore with the keyboard up.
  useEffect(() => {
    if (focus) setTimeout(() => input.current?.focus(), 350);
  }, [focus]);

  useEffect(() => {
    filters.set({ q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const query = useMemo(
    () => ({
      q: q || undefined,
      cityIds: filters.place ? placeCityIds(filters.place) : undefined,
      datePreset: filters.datePreset ?? undefined,
      categoryIds: filters.categoryId ? [filters.categoryId] : undefined,
      eventTypes: filters.eventType ? [filters.eventType] : undefined,
    }),
    [q, filters.place, filters.datePreset, filters.categoryId, filters.eventType],
  );
  const results = useEventSearch(query);
  const items = useMemo(() => results.data?.pages.flatMap((p) => p.items) ?? [], [results.data]);
  const total = results.data?.pages[0]?.total;
  const hasFilters = Boolean(filters.place || filters.datePreset || filters.categoryId || filters.eventType);
  const showSuggestions = focused && !text;

  const accessory = (
    <View style={styles.accessory}>
      <SearchField
        ref={input}
        value={text}
        onChangeText={setText}
        onClear={() => setText('')}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Events, topics, cities, organizers"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipScroller}>
        {hasFilters ? (
          <Pressable onPress={filters.reset} accessibilityRole="button" accessibilityLabel="Clear all filters" style={[styles.clear, { backgroundColor: colors.tertiaryFill }]}>
            <Ionicons name="close" size={16} color={colors.label} />
          </Pressable>
        ) : null}
        <Chip label={filters.place ? placeName(filters.place) : 'Location'} icon="location" selected={Boolean(filters.place)} menu onPress={() => setPicker('place')} />
        <Chip label={filters.datePreset ? DATE_PRESET_LABELS[filters.datePreset] : 'Dates'} selected={Boolean(filters.datePreset)} menu onPress={() => setPicker('date')} />
        <Chip label={filters.categoryId ? (getCategory(filters.categoryId)?.name ?? 'Category') : 'Category'} selected={Boolean(filters.categoryId)} menu onPress={() => setPicker('category')} />
        <Chip label={filters.eventType ? EVENT_TYPE_LABELS[filters.eventType] : 'Type'} selected={Boolean(filters.eventType)} menu onPress={() => setPicker('type')} />
      </ScrollView>
    </View>
  );

  const listHeader = showSuggestions ? (
    <View style={styles.suggestions}>
      <ListGroup header="Suggested Searches">
        {SUGGESTIONS.map((s) => (
          <Pressable key={s} onPress={() => setText(s)} accessibilityRole="button" style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.quaternaryFill }]}>
            <Ionicons name="search" size={18} color={colors.secondaryLabel} />
            <Text variant="body">{s}</Text>
          </Pressable>
        ))}
      </ListGroup>
    </View>
  ) : (
    <View style={styles.countRow}>
      {total !== undefined && !results.isPending ? (
        <Text variant="subheadline" tone="secondary">
          {total === 0 ? 'No events' : `${total} ${total === 1 ? 'event' : 'events'}`}
          {q ? ` for “${q}”` : hasFilters ? '' : ' coming up'}
        </Text>
      ) : null}
    </View>
  );

  return (
    <>
      <LargeTitleFlatList<EventSummary>
        title="Explore"
        tabRoot
        accessory={accessory}
        listHeader={listHeader}
        data={showSuggestions ? [] : items}
        keyExtractor={(e) => e.id}
        renderItem={({ item, index }) => <EventRow event={item} position={rowPosition(index, items.length)} />}
        onEndReached={() => results.hasNextPage && !results.isFetchingNextPage && results.fetchNextPage()}
        onEndReachedThreshold={0.6}
        initialNumToRender={8}
        windowSize={7}
        ListEmptyComponent={
          showSuggestions ? null : results.isPending ? (
            <View>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <EventRowSkeleton key={i} position={rowPosition(i, 6)} />
              ))}
            </View>
          ) : results.isError ? (
            <ErrorState onRetry={() => results.refetch()} />
          ) : (
            <EmptyState
              icon="search"
              title="No Events Found"
              message={hasFilters ? 'Try another location, date range or category.' : 'Try a different word, like a technology, city or organizer.'}
              actionLabel={hasFilters ? 'Clear Filters' : undefined}
              onAction={hasFilters ? filters.reset : undefined}
            />
          )
        }
        ListFooterComponent={results.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.secondaryLabel} /> : null}
      />
      <PlaceSheet visible={picker === 'place'} onClose={() => setPicker(null)} value={filters.place} onChange={(place) => filters.set({ place })} allowAny />
      <DateSheet visible={picker === 'date'} onClose={() => setPicker(null)} value={filters.datePreset} onChange={(datePreset) => filters.set({ datePreset })} />
      <CategorySheet visible={picker === 'category'} onClose={() => setPicker(null)} value={filters.categoryId} onChange={(categoryId) => filters.set({ categoryId })} />
      <EventTypeSheet visible={picker === 'type'} onClose={() => setPicker(null)} value={filters.eventType} onChange={(eventType) => filters.set({ eventType })} />
    </>
  );
}

const styles = StyleSheet.create({
  accessory: { gap: spacing.md },
  chipScroller: { marginHorizontal: -spacing.lg },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  clear: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  countRow: { paddingHorizontal: spacing.lg + spacing.xs, paddingBottom: spacing.sm, minHeight: 28 },
  suggestions: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 48 },
  footer: { paddingVertical: spacing.xl },
});
