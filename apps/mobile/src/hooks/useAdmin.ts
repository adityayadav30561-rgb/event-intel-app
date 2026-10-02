import type { AdminCreateEvent, AdminEventPatch, MergeChoice } from '@eii/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminRepository } from '@/repositories';
import { useCurrentUser } from '@/store/sessionStore';

/** Admin and researcher tools (Phase 8). Not cached for offline use: these need the live server. */

export const useCanAdmin = () => {
  const role = useCurrentUser()?.role;
  return role === 'admin' || role === 'researcher';
};

const k = {
  all: ['admin'] as const,
  overview: ['admin', 'overview'] as const,
  review: ['admin', 'review'] as const,
  event: (id: string) => ['admin', 'event', id] as const,
  duplicates: ['admin', 'duplicates'] as const,
  conflicts: ['admin', 'conflicts'] as const,
  sync: ['admin', 'sync'] as const,
};

const fresh = { staleTime: 0, gcTime: 60_000 };

export const useAdminOverview = () => useQuery({ queryKey: k.overview, queryFn: () => adminRepository.overview(), enabled: useCanAdmin(), ...fresh });
export const useReviewQueue = () => useQuery({ queryKey: k.review, queryFn: () => adminRepository.review(), ...fresh });
export const useAdminEvent = (id: string | undefined) => useQuery({ queryKey: k.event(id ?? ''), queryFn: () => adminRepository.event(id!), enabled: Boolean(id), ...fresh });
export const useDuplicates = () => useQuery({ queryKey: k.duplicates, queryFn: () => adminRepository.duplicates(), ...fresh });
export const useConflicts = () => useQuery({ queryKey: k.conflicts, queryFn: () => adminRepository.conflicts(), ...fresh });
export const useSyncInfo = (polling: boolean) =>
  useQuery({ queryKey: k.sync, queryFn: () => adminRepository.sync(), refetchInterval: polling ? 5000 : false, ...fresh });

/** After any change: admin lists and the app's event data refresh. */
function useAfterChange() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: k.all });
    void client.invalidateQueries({ queryKey: ['events'] });
    void client.invalidateQueries({ queryKey: ['home'] });
  };
}

export function useEditEvent(id: string) {
  const done = useAfterChange();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: AdminEventPatch) => adminRepository.edit(id, patch),
    onSuccess: (event) => {
      client.setQueryData(k.event(id), event);
      done();
    },
  });
}

export function useClearOverride(id: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (field: string) => adminRepository.clearOverride(id, field), onSuccess: (event) => client.setQueryData(k.event(id), event) });
}

export function useReviewDecision() {
  const done = useAfterChange();
  return useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => (approve ? adminRepository.verify(id) : adminRepository.reject(id)),
    onSuccess: done,
  });
}

export function useCreateEvent() {
  const done = useAfterChange();
  return useMutation({ mutationFn: (input: AdminCreateEvent) => adminRepository.create(input), onSuccess: done });
}

export function useMerge() {
  const done = useAfterChange();
  return useMutation({
    mutationFn: ({ id, choice }: { id: string; choice: MergeChoice | 'dismiss' }) => (choice === 'dismiss' ? adminRepository.dismissDuplicate(id).then(() => '') : adminRepository.merge(id, choice)),
    onSuccess: done,
  });
}

export function useResolveConflict() {
  const done = useAfterChange();
  return useMutation({ mutationFn: ({ id, index }: { id: string; index: number }) => adminRepository.resolveConflict(id, index), onSuccess: done });
}

export function useRunSync() {
  const client = useQueryClient();
  return useMutation({ mutationFn: () => adminRepository.runSync(), onSuccess: () => client.invalidateQueries({ queryKey: k.sync }) });
}

export function useSetSource() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean | null }) => adminRepository.setSourceEnabled(id, enabled),
    onSuccess: () => client.invalidateQueries({ queryKey: k.sync }),
  });
}
