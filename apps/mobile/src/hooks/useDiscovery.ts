import type { SavedSearch, SavedSearchQuery } from '@eii/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accountRepository } from '@/repositories';
import { useSessionStage } from '@/store/sessionStore';

/** Saved searches (§68), kept on the server so match alerts can use them. */
const key = ['me', 'saved-searches'] as const;

export function useSavedSearches() {
  const stage = useSessionStage();
  return useQuery({ queryKey: key, queryFn: () => accountRepository.savedSearches(), enabled: stage === 'ready', staleTime: 5 * 60_000 });
}

export function useCreateSavedSearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; query: SavedSearchQuery }) => accountRepository.createSavedSearch(input),
    onSuccess: (saved) => client.setQueryData<SavedSearch[]>(key, (list) => [saved, ...(list ?? [])]),
  });
}

export function useRenameSavedSearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => accountRepository.updateSavedSearch(id, { name }),
    onSuccess: (saved) => client.setQueryData<SavedSearch[]>(key, (list) => list?.map((s) => (s.id === saved.id ? saved : s))),
  });
}

export function useDeleteSavedSearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => accountRepository.deleteSavedSearch(id),
    onMutate: (id) => client.setQueryData<SavedSearch[]>(key, (list) => list?.filter((s) => s.id !== id)),
    onError: () => client.invalidateQueries({ queryKey: key }),
  });
}
