import type { AuthSession, Me } from '@eii/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/storage';

/**
 * Who is signed in on this device. Kept in device storage so the app opens straight into the
 * signed-in state without waiting on the network (spec §146); tokens are refreshed in the
 * background. The refresh token stays on this device only and is rotated on every use.
 */
type SessionState = {
  session: AuthSession | null;
  /** Why the last session ended, shown once on the sign-in screen. */
  ended: 'expired' | null;
  setSession: (session: AuthSession) => void;
  setUser: (user: Me) => void;
  signOut: (reason?: 'expired') => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      ended: null,
      setSession: (session) => set({ session, ended: null }),
      setUser: (user) => set((s) => (s.session ? { session: { ...s.session, user } } : s)),
      signOut: (reason) => set({ session: null, ended: reason ?? null }),
    }),
    {
      name: 'eii.session',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ session: s.session }),
    },
  ),
);

/** Where the app should be: signed out, choosing a password, onboarding, or in. */
export function useSessionStage(): 'signed_out' | 'set_password' | 'onboarding' | 'ready' {
  const user = useSessionStore((s) => s.session?.user);
  if (!user) return 'signed_out';
  if (user.mustChangePassword) return 'set_password';
  if (!user.onboarded) return 'onboarding';
  return 'ready';
}

export const useCurrentUser = () => useSessionStore((s) => s.session?.user ?? null);
