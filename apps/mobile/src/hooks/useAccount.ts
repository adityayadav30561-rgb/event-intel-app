import { scoreRelevance, type EventSummary, type Preferences, type Relevance, type Role } from '@eii/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { accountRepository } from '@/repositories';
import { useSessionStage, useSessionStore } from '@/store/sessionStore';

/** Account hooks (Phase 4): session, interests, suggestions and the team. */

export const accountKeys = {
  me: () => ['me'] as const,
  preferences: () => ['me', 'preferences'] as const,
  forYou: () => ['me', 'for-you'] as const,
  team: () => ['admin', 'team'] as const,
};

export function useSignIn() {
  const client = useQueryClient();
  const setSession = useSessionStore((s) => s.setSession);
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => accountRepository.login(email, password),
    onSuccess: (session) => {
      // Nothing from a previous person's session may show for the new one.
      client.clear();
      setSession(session);
    },
  });
}

export function useSignOut() {
  const client = useQueryClient();
  return () => {
    const session = useSessionStore.getState().session;
    if (session) void accountRepository.logout(session.refreshToken);
    useSessionStore.getState().signOut();
    client.clear();
  };
}

export function useChangePassword() {
  const client = useQueryClient();
  const setSession = useSessionStore((s) => s.setSession);
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => accountRepository.changePassword(currentPassword, newPassword),
    onSuccess: (session) => {
      // Keep the cached profile in step, or an older copy could switch the stage back.
      client.setQueryData(accountKeys.me(), session.user);
      setSession(session);
    },
  });
}

/** Keeps the stored profile current (role, onboarding, password state) without blocking startup. */
export function useMeSync() {
  const signedIn = useSessionStore((s) => Boolean(s.session));
  const setUser = useSessionStore((s) => s.setUser);
  const me = useQuery({ queryKey: accountKeys.me(), queryFn: () => accountRepository.me(), enabled: signedIn, staleTime: 5 * 60_000, refetchOnMount: 'always' });
  // Only a copy fetched during this launch may change the stage; an older cached one is ignored.
  const fresh = me.isFetchedAfterMount ? me.data : undefined;
  useEffect(() => {
    if (fresh) setUser(fresh);
  }, [fresh, setUser]);
}

export function useCompleteOnboarding() {
  const client = useQueryClient();
  const setUser = useSessionStore((s) => s.setUser);
  return useMutation({
    mutationFn: () => accountRepository.completeOnboarding(),
    onSuccess: (me) => {
      client.setQueryData(accountKeys.me(), me);
      setUser(me);
    },
  });
}

export function usePreferences() {
  const stage = useSessionStage();
  return useQuery({
    queryKey: accountKeys.preferences(),
    queryFn: () => accountRepository.preferences(),
    enabled: stage === 'ready' || stage === 'onboarding',
    staleTime: 5 * 60_000,
  });
}

/** Saves interests. The screen updates at once; the server copy follows. */
export function useSavePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Preferences) => accountRepository.savePreferences(prefs),
    onMutate: async (prefs) => {
      await client.cancelQueries({ queryKey: accountKeys.preferences() });
      const previous = client.getQueryData<Preferences>(accountKeys.preferences());
      client.setQueryData(accountKeys.preferences(), prefs);
      return { previous };
    },
    onError: (_error, _prefs, context) => {
      if (context?.previous) client.setQueryData(accountKeys.preferences(), context.previous);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: accountKeys.forYou() });
    },
  });
}

export function useForYou() {
  const stage = useSessionStage();
  return useQuery({ queryKey: accountKeys.forYou(), queryFn: () => accountRepository.forYou(10), enabled: stage === 'ready' });
}

/** How well an event fits the signed-in person's interests (same rules as the server). */
export function useRelevance(event: Pick<EventSummary, 'technologyIds' | 'categoryIds' | 'industryIds' | 'cityId' | 'city' | 'eventType'> | undefined): Relevance | undefined {
  const prefs = usePreferences().data;
  return useMemo(() => (event ? scoreRelevance(event, prefs) : undefined), [event, prefs]);
}

export function useTeam(enabled = true) {
  return useQuery({ queryKey: accountKeys.team(), queryFn: () => accountRepository.team(), enabled });
}

export function useAddMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; email: string; role: Role }) => accountRepository.addMember(input),
    onSuccess: () => client.invalidateQueries({ queryKey: accountKeys.team() }),
  });
}

export function useUpdateMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; isActive?: boolean; role?: Role; resetPassword?: true }) => accountRepository.updateMember(id, input),
    onSuccess: () => client.invalidateQueries({ queryKey: accountKeys.team() }),
  });
}
