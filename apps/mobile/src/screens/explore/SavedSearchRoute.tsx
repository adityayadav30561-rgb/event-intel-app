import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { EmptyState } from '@/components/ui';
import { useSavedSearches } from '@/hooks/useDiscovery';
import { fromSavedQuery, useExploreStore } from '@/store/exploreStore';

/** /saved-search/:id (from a match alert): runs that saved search in Explore. */
export function SavedSearchRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const searches = useSavedSearches();
  const search = searches.data?.find((s) => s.id === id);

  useEffect(() => {
    if (!search) return;
    useExploreStore.getState().set({ ...fromSavedQuery(search.query), view: 'list' });
    router.replace('/explore');
  }, [search]);

  if (searches.data && !search) {
    return <EmptyState icon="bookmark-outline" title="Search Not Found" message="It may have been deleted." actionLabel="Go to Explore" onAction={() => router.replace('/explore')} />;
  }
  return null;
}
