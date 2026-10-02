import type { NotificationSettings, Reminder } from '@eii/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { disablePush, enablePush, pushStatus, refreshPushRegistration, type PushStatus } from '@/platform/push';
import { accountRepository } from '@/repositories';
import { useSessionStage } from '@/store/sessionStore';

/** Alerts, inbox and reminders (Phase 7). */

const keys = {
  settings: ['me', 'notification-settings'] as const,
  inbox: ['me', 'notifications'] as const,
  reminders: ['me', 'reminders'] as const,
};

/** Whether this device gets alerts, and turning them on (from a tap) or off. */
export function usePush() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => void pushStatus().then(setStatus), []);
  useEffect(() => {
    refresh();
    // Permission can change in Settings while the app is in the background.
    const onVisible = () => typeof document !== 'undefined' && document.visibilityState === 'visible' && refresh();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);
  const turnOn = async () => {
    setBusy(true);
    try {
      setStatus(await enablePush());
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      await disablePush();
      setStatus(await pushStatus());
    } finally {
      setBusy(false);
    }
  };
  return { status, busy, turnOn, turnOff };
}

/** Re-registers this device on launch (browsers may renew subscriptions). */
export function usePushRefresh() {
  const stage = useSessionStage();
  useEffect(() => {
    if (stage === 'ready') void refreshPushRegistration();
  }, [stage]);
}

export function useNotificationSettings() {
  const stage = useSessionStage();
  return useQuery({ queryKey: keys.settings, queryFn: () => accountRepository.notificationSettings(), enabled: stage === 'ready' });
}

export function useSaveNotificationSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (s: NotificationSettings) => accountRepository.saveNotificationSettings(s),
    onMutate: (s) => {
      const previous = client.getQueryData<NotificationSettings>(keys.settings);
      client.setQueryData(keys.settings, s);
      return { previous };
    },
    onError: (_e, _s, ctx) => ctx?.previous && client.setQueryData(keys.settings, ctx.previous),
  });
}

export function useInbox() {
  const stage = useSessionStage();
  return useQuery({
    queryKey: keys.inbox,
    queryFn: () => accountRepository.notifications(),
    enabled: stage === 'ready',
    // New alerts arrive by push; the inbox also refreshes now and then while open.
    refetchInterval: 2 * 60_000,
  });
}

export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => accountRepository.markNotificationsRead(ids),
    onMutate: (ids) => {
      client.setQueryData<Awaited<ReturnType<typeof accountRepository.notifications>>>(keys.inbox, (data) => {
        if (!data) return data;
        const now = new Date().toISOString();
        const items = data.items.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n));
        return { ...data, items, unread: ids ? Math.max(0, data.unread - ids.length) : 0 };
      });
    },
  });
}

export function useReminders() {
  const stage = useSessionStage();
  return useQuery({ queryKey: keys.reminders, queryFn: () => accountRepository.reminders(), enabled: stage === 'ready' });
}

export function useToggleReminder(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ offsetMinutes, existing }: { offsetMinutes: number; existing?: Reminder }) => {
      if (existing) {
        await accountRepository.removeReminder(existing.id);
        return (client.getQueryData<Reminder[]>(keys.reminders) ?? []).filter((r) => r.id !== existing.id);
      }
      return accountRepository.addReminder(eventId, offsetMinutes);
    },
    onSuccess: (list) => client.setQueryData(keys.reminders, list),
  });
}

export function useRemoveReminder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => accountRepository.removeReminder(id),
    onMutate: (id) => client.setQueryData<Reminder[]>(keys.reminders, (list) => list?.filter((r) => r.id !== id)),
  });
}
