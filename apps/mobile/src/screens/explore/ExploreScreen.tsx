import { Ionicons } from '@expo/vector-icons';
import { DATE_PRESET_LABELS, EVENT_TYPE_LABELS, getCategory, parseSearch, removeSearchPart, type EventSummary, type SearchPart } from '@eii/shared';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { EventRow, EventRowSkeleton, openEvent, rowPosition } from '@/components/event';
import { PageHeader, LargeTitleFlatList } from '@/components/layout/LargeTitle';
import { EventMap } from '@/components/map/EventMap';
import { FiltersSheet, NearSheet, SaveSearchSheet, SORT_LABELS, SortSheet } from '@/components/pickers/DiscoverySheets';
import { CategorySheet, DateSheet, EventTypeSheet } from '@/components/pickers/FilterSheets';
import { PlaceSheet } from '@/components/pickers/PlaceSheet';
import { Chip, EmptyState, ErrorState, IconButton, ListGroup, SearchField, showToast, Text } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useCreateSavedSearch, useSavedSearches } from '@/hooks/useDiscovery';
import { useEventSearch } from '@/hooks/useEvents';
import { errorMessage } from '@/lib/errors';
import { currentPosition } from '@/services/location';
import { describeSearch, exploreQuery, extraFilterCount, fromSavedQuery, hasAnyFilter, toSavedQuery, useExploreStore, useRecentSearches } from '@/store/exploreStore';
import { placeName } from '@/store/placeStore';
import { spacing, useTheme } from '@/theme';

/** Typed like this, the search turns into filters (§16). */
const SUGGESTIONS = ['SAP events in Delhi next month', 'ERP conferences in Hyderabad', 'Manufacturing expos', 'Events in South India', 'Free AI webinars', 'Odoo', 'Cybersecurity summits'];

type Picker = 'place' | 'date' | 'category' | 'type' | 'filters' | 'sort' | 'near' | 'save' | null;

const partIcon: Record<SearchPart['kind'], keyof typeof Ionicons.glyphMap> = {
  place: 'location',
  date: 'calendar',
  technology: 'layers',
  category: 'pricetag',
  industry: 'business',
  type: 'easel',
  price: 'cash',
  online: 'videocam',
};

/** Explore — search, filter and map every upcoming event (spec §14–21). */
export function ExploreScreen() {
  const { colors } = useTheme();
  const filters = useExploreStore();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const input = useRef<TextInput>(null);
  const [text, setText] = useState(filters.q);
  const [focused, setFocused] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [locating, setLocating] = useState(false);
  const q = useDebouncedValue(text.trim(), 250);
  const recent = useRecentSearches();
  const saved = useSavedSearches().data ?? [];
  const createSaved = useCreateSavedSearch();

  // Home's search field opens Explore with the keyboard up.
  useEffect(() => {
    if (focus) setTimeout(() => input.current?.focus(), 350);
  }, [focus]);

  // A saved search applied elsewhere (or "clear all") changes the stored text: show it.
  const storedQ = filters.q;
  const [lastStored, setLastStored] = useState(storedQ);
  if (storedQ !== lastStored) {
    setLastStored(storedQ);
    if (storedQ !== q) setText(storedQ);
  }

  useEffect(() => {
    if (q !== useExploreStore.getState().q) useExploreStore.getState().set({ q });
    if (q.length >= 2) {
      const timer = setTimeout(() => useRecentSearches.getState().add(q), 1500);
      return () => clearTimeout(timer);
    }
  }, [q]);

  const parsed = useMemo(() => parseSearch(q), [q]);
  const query = useMemo(() => exploreQuery(filters, parsed.text, parsed.parts), [filters, parsed]);
  const results = useEventSearch(query, filters.view === 'list');
  const items = useMemo(() => results.data?.pages.flatMap((p) => p.items) ?? [], [results.data]);
  const total = results.data?.pages[0]?.total;
  const anyFilter = hasAnyFilter(filters);
  const searching = Boolean(q) || anyFilter;
  const showSuggestions = focused && !text && filters.view === 'list';
  const extras = extraFilterCount(filters);

  const toggleNear = async () => {
    if (filters.near) {
      setPicker('near');
      return;
    }
    setLocating(true);
    try {
      const pos = await currentPosition();
      filters.set({ near: { ...pos, radiusKm: 25 }, place: null });
    } catch (error) {
      showToast(errorMessage(error), 'location');
    } finally {
      setLocating(false);
    }
  };

  const applySaved = (query: Parameters<typeof fromSavedQuery>[0]) => {
    const next = fromSavedQuery(query);
    useExploreStore.getState().set(next);
    setText(next.q);
    input.current?.blur();
  };

  const clearAll = () => {
    filters.reset();
    setText('');
  };

  const headerRight = (
    <View style={styles.headerButtons}>
      {searching ? <IconButton icon="bookmark-outline" label="Save Search" variant="fill" size={34} onPress={() => setPicker('save')} /> : null}
      <IconButton
        icon={filters.view === 'map' ? 'list' : 'map'}
        label={filters.view === 'map' ? 'Show List' : 'Show Map'}
        variant="fill"
        size={34}
        onPress={() => filters.set({ view: filters.view === 'map' ? 'list' : 'map' })}
      />
    </View>
  );

  const accessory = (
    <View style={styles.accessory}>
      <SearchField
        ref={input}
        value={text}
        onChangeText={setText}
        onClear={() => setText('')}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Try “SAP events in Delhi next month”"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipScroller} keyboardShouldPersistTaps="handled">
        {searching ? (
          <Pressable onPress={clearAll} accessibilityRole="button" accessibilityLabel="Clear search and filters" style={[styles.clear, { backgroundColor: colors.tertiaryFill }]}>
            <Ionicons name="close" size={16} color={colors.label} />
          </Pressable>
        ) : null}
        {parsed.parts.map((part) => (
          <Pressable
            key={`${part.kind}:${part.label}`}
            onPress={() => setText(removeSearchPart(text, part))}
            accessibilityRole="button"
            accessibilityLabel={`${part.label}, from your search. Remove`}
            style={({ pressed }) => [styles.parsed, { backgroundColor: colors.tintSoft }, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name={partIcon[part.kind]} size={14} color={colors.tint} />
            <Text variant="subheadlineStrong" tone="tint" numberOfLines={1}>
              {part.label}
            </Text>
            <Ionicons name="close" size={14} color={colors.tint} />
          </Pressable>
        ))}
        <Chip
          label={filters.near ? `Within ${filters.near.radiusKm} km` : locating ? 'Locating…' : 'Near Me'}
          icon={filters.near ? 'navigate' : 'navigate-outline'}
          selected={Boolean(filters.near)}
          menu={Boolean(filters.near)}
          onPress={toggleNear}
        />
        {filters.near ? null : (
          <Chip label={filters.place ? placeName(filters.place) : 'Location'} icon="location" selected={Boolean(filters.place)} menu onPress={() => setPicker('place')} />
        )}
        <Chip label={filters.datePreset ? DATE_PRESET_LABELS[filters.datePreset] : 'Dates'} selected={Boolean(filters.datePreset)} menu onPress={() => setPicker('date')} />
        <Chip label={filters.categoryId ? (getCategory(filters.categoryId)?.name ?? 'Category') : 'Category'} selected={Boolean(filters.categoryId)} menu onPress={() => setPicker('category')} />
        <Chip label={filters.eventType ? EVENT_TYPE_LABELS[filters.eventType] : 'Type'} selected={Boolean(filters.eventType)} menu onPress={() => setPicker('type')} />
        <Chip label={extras ? `Filters · ${extras}` : 'Filters'} icon="options" selected={extras > 0} onPress={() => setPicker('filters')} />
        {filters.view === 'list' ? (
          <Chip label={filters.sort ? SORT_LABELS[filters.sort] : 'Sort'} icon="swap-vertical" selected={Boolean(filters.sort)} onPress={() => setPicker('sort')} />
        ) : null}
      </ScrollView>
    </View>
  );

  const suggestions = (
    <View style={styles.suggestions}>
      {saved.length ? (
        <ListGroup header="Saved Searches" separatorInset={52}>
          {saved.slice(0, 6).map((s) => (
            <SuggestionRow key={s.id} icon="bookmark" label={s.name} onPress={() => applySaved(s.query)} />
          ))}
        </ListGroup>
      ) : null}
      {recent.recent.length ? (
        <ListGroup header="Recent" separatorInset={52}>
          {recent.recent.map((r) => (
            <SuggestionRow key={r} icon="time-outline" label={r} onPress={() => setText(r)} />
          ))}
        </ListGroup>
      ) : null}
      <ListGroup header="Try Searching" separatorInset={52}>
        {SUGGESTIONS.map((s) => (
          <SuggestionRow key={s} icon="search" label={s} onPress={() => setText(s)} />
        ))}
      </ListGroup>
      {recent.recent.length ? (
        <Pressable onPress={recent.clear} accessibilityRole="button" style={styles.clearRecent}>
          <Text variant="subheadline" tone="tint">
            Clear Recent Searches
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  const sheets = (
    <>
      <PlaceSheet visible={picker === 'place'} onClose={() => setPicker(null)} value={filters.place} onChange={(place) => filters.set({ place })} allowAny />
      <DateSheet visible={picker === 'date'} onClose={() => setPicker(null)} value={filters.datePreset} onChange={(datePreset) => filters.set({ datePreset })} />
      <CategorySheet visible={picker === 'category'} onClose={() => setPicker(null)} value={filters.categoryId} onChange={(categoryId) => filters.set({ categoryId })} />
      <EventTypeSheet visible={picker === 'type'} onClose={() => setPicker(null)} value={filters.eventType} onChange={(eventType) => filters.set({ eventType })} />
      <FiltersSheet visible={picker === 'filters'} onClose={() => setPicker(null)} filters={filters} onChange={filters.set} />
      <SortSheet visible={picker === 'sort'} onClose={() => setPicker(null)} value={filters.sort} onChange={(sort) => filters.set({ sort })} hasText={Boolean(parsed.text)} hasLocation={Boolean(filters.near)} />
      <NearSheet
        visible={picker === 'near'}
        onClose={() => setPicker(null)}
        radiusKm={filters.near?.radiusKm ?? 25}
        onChange={(radiusKm) => filters.near && filters.set({ near: { ...filters.near, radiusKm } })}
        onStop={() => filters.set({ near: null, sort: filters.sort === 'distance' ? null : filters.sort })}
      />
      <SaveSearchSheet
        visible={picker === 'save'}
        onClose={() => {
          createSaved.reset();
          setPicker(null);
        }}
        suggestedName={describeSearch({ ...filters, q: text })}
        saving={createSaved.isPending}
        error={createSaved.error ? errorMessage(createSaved.error) : undefined}
        onSave={(name) =>
          createSaved.mutate(
            { name, query: toSavedQuery({ ...filters, q: text }) },
            {
              onSuccess: () => {
                setPicker(null);
                showToast('Search saved', 'bookmark');
              },
            },
          )
        }
      />
    </>
  );

  if (filters.view === 'map') {
    return (
      <>
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <PageHeader title="Explore" headerRight={headerRight} accessory={accessory} />
          <View style={styles.mapWrap}>
            <EventMap query={query} onOpen={openEvent} />
          </View>
        </View>
        {sheets}
      </>
    );
  }

  const listHeader = showSuggestions ? (
    suggestions
  ) : (
    <View style={styles.countRow}>
      {total !== undefined && !results.isPending ? (
        <Text variant="subheadline" tone="secondary">
          {total === 0 ? 'No events' : `${total} ${total === 1 ? 'event' : 'events'}`}
          {parsed.text ? ` for “${parsed.text}”` : searching ? '' : ' coming up'}
          {filters.near ? ' near you' : ''}
        </Text>
      ) : null}
    </View>
  );

  return (
    <>
      <LargeTitleFlatList<EventSummary>
        title="Explore"
        tabRoot
        headerRight={headerRight}
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
              message={
                filters.near
                  ? 'Nothing this close. Try a larger distance.'
                  : searching
                    ? 'Try fewer filters, another place, or a different word.'
                    : 'Try a technology, city or organizer.'
              }
              actionLabel={searching ? 'Clear Search' : undefined}
              onAction={searching ? clearAll : undefined}
            />
          )
        }
        ListFooterComponent={results.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.secondaryLabel} /> : null}
      />
      {sheets}
    </>
  );
}

function SuggestionRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.quaternaryFill }]}>
      <Ionicons name={icon} size={18} color={colors.secondaryLabel} />
      <Text variant="body" numberOfLines={1} style={styles.flex}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  mapWrap: { flex: 1 },
  headerButtons: { flexDirection: 'row', gap: spacing.sm },
  accessory: { gap: spacing.md },
  chipScroller: { marginHorizontal: -spacing.lg },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  clear: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  parsed: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 17 },
  countRow: { paddingHorizontal: spacing.lg + spacing.xs, paddingBottom: spacing.sm, minHeight: 28 },
  suggestions: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.xl },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 48 },
  clearRecent: { alignSelf: 'center', paddingVertical: spacing.sm },
  footer: { paddingVertical: spacing.xl },
  flex: { flex: 1, minWidth: 0 },
});
