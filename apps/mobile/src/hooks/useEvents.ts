import type { EventQuery, HomeQuery } from '@eii/shared';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { eventRepository } from '@/repositories';

/** Server-state hooks (TanStack Query). Screens use these; they never call repositories directly. */

export const eventKeys = {
  home: (q: HomeQuery) => ['home', q] as const,
  search: (q: EventQuery) => ['events', 'search', q] as const,
  detail: (id: string) => ['events', 'detail', id] as const,
  related: (id: string) => ['events', 'related', id] as const,
  organizer: (id: string) => ['organizers', id] as const,
  cityCounts: () => ['cities', 'counts'] as const,
  syncStatus: () => ['sync', 'status'] as const,
};

export function useHomeFeed(query: HomeQuery) {
  return useQuery({ queryKey: eventKeys.home(query), queryFn: () => eventRepository.home(query), placeholderData: keepPreviousData });
}

/** Paged results for infinite scrolling. */
export function useEventSearch(query: Omit<EventQuery, 'cursor'>, enabled = true) {
  return useInfiniteQuery({
    queryKey: eventKeys.search(query),
    queryFn: ({ pageParam }) => eventRepository.search({ ...query, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useEvent(id: string | undefined) {
  return useQuery({ queryKey: eventKeys.detail(id ?? ''), queryFn: () => eventRepository.get(id ?? ''), enabled: Boolean(id) });
}

export function useRelatedEvents(id: string | undefined) {
  return useQuery({ queryKey: eventKeys.related(id ?? ''), queryFn: () => eventRepository.related(id ?? ''), enabled: Boolean(id) });
}

export function useOrganizer(id: string | undefined) {
  return useQuery({ queryKey: eventKeys.organizer(id ?? ''), queryFn: () => eventRepository.organizer(id ?? ''), enabled: Boolean(id) });
}

export function useCityCounts() {
  return useQuery({ queryKey: eventKeys.cityCounts(), queryFn: () => eventRepository.cityCounts(), staleTime: 10 * 60_000 });
}

export function useSyncStatus() {
  return useQuery({ queryKey: eventKeys.syncStatus(), queryFn: () => eventRepository.syncStatus(), staleTime: 5 * 60_000 });
}

/** True while the app shows sample events (until real sources are connected). */
export function useIsSampleData(): boolean {
  return useSyncStatus().data?.mode !== 'live';
}
