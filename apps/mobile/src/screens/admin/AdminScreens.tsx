import { formatRelativePast } from '@eii/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { EMPTY_FORM, EventForm, formFromEvent, formPatch, formToCreate, OverrideList, validateForm, type EventFormState } from '@/components/admin/EventForm';
import { whenWhere } from '@/components/event';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { Button, EmptyState, ErrorState, FormField, ListGroup, ListRow, showToast, Skeleton, Text } from '@/components/ui';
import { useAdminEvent, useAdminOverview, useClearOverride, useCreateEvent, useEditEvent, useReviewDecision, useReviewQueue } from '@/hooks/useAdmin';
import { errorMessage } from '@/lib/errors';
import { adminRepository, type ImportDraft } from '@/repositories';
import { saveFile } from '@/services/share';
import { useCurrentUser } from '@/store/sessionStore';
import { radius, spacing, useTheme } from '@/theme';

/** More → Admin (Phase 8): data quality from the phone. */
export function AdminScreen() {
  const { colors } = useTheme();
  const overview = useAdminOverview();
  const isAdmin = useCurrentUser()?.role === 'admin';
  const o = overview.data;
  const count = (n: number | undefined) => (n ? String(n) : undefined);
  const [backingUp, setBackingUp] = useState(false);
  const downloadBackup = async () => {
    setBackingUp(true);
    try {
      const backup = await adminRepository.backup();
      const result = await saveFile(`eii-backup-${backup.createdAt.slice(0, 10)}.json`, JSON.stringify(backup));
      if (result === 'saved') showToast('Backup ready', 'checkmark-circle');
    } catch (error) {
      showToast(errorMessage(error), 'alert-circle');
    } finally {
      setBackingUp(false);
    }
  };
  return (
    <LargeTitleScrollView title="Admin" back>
      <View style={styles.body}>
        {overview.isError && !o ? <ErrorState message={errorMessage(overview.error)} onRetry={() => overview.refetch()} /> : null}
        <ListGroup header="Events" footer="Approved and corrected events appear for everyone on their next refresh.">
          <ListRow icon="checkmark-done" iconColor={colors.orange} title="Review Queue" detail={count(o?.review)} onPress={() => router.push('/admin/review')} />
          <ListRow icon="copy" iconColor={colors.indigo} title="Possible Duplicates" detail={count(o?.duplicates)} onPress={() => router.push('/admin/duplicates')} />
          <ListRow icon="git-compare" iconColor={colors.red} title="Source Conflicts" detail={count(o?.conflicts)} onPress={() => router.push('/admin/conflicts')} />
          <ListRow icon="add-circle" iconColor={colors.green} title="Add Event" onPress={() => router.push('/admin/add')} />
        </ListGroup>
        <ListGroup header="Data" footer={isAdmin ? 'The backup holds everyone’s saves, plans, notes, checklists, reminders, saved searches and your edits. Events from sources come back with a sync. Keep it private.' : undefined}>
          <ListRow
            icon="sync"
            iconColor={colors.blue}
            title="Sync & Sources"
            subtitle={o?.lastSyncAt ? `Last sync ${formatRelativePast(new Date(o.lastSyncAt))}${o.lastSyncStatus === 'partial_success' ? ' · some sources failed' : ''}` : undefined}
            detail={o?.failingSources ? `${o.failingSources} failing` : undefined}
            onPress={() => router.push('/admin/sync')}
          />
          {isAdmin ? <ListRow icon="people" iconColor={colors.gray} title="Team" onPress={() => router.push('/settings/team')} /> : null}
          {isAdmin ? (
            <ListRow icon="archive" iconColor={colors.teal} title="Download Backup" detail={backingUp ? 'Preparing…' : undefined} onPress={backingUp ? undefined : downloadBackup} />
          ) : null}
        </ListGroup>
      </View>
    </LargeTitleScrollView>
  );
}

/** Events waiting for a decision (§128). */
export function ReviewScreen() {
  const { colors } = useTheme();
  const queue = useReviewQueue();
  const items = queue.data ?? [];
  return (
    <LargeTitleScrollView title="Review Queue" back>
      <View style={styles.body}>
        {queue.isPending ? (
          <Skeleton height={140} round={radius.lg} />
        ) : queue.isError ? (
          <ErrorState message={errorMessage(queue.error)} onRetry={() => queue.refetch()} />
        ) : items.length ? (
          <ListGroup footer="Open an event to approve it, correct it first, or reject it.">
            {items.map((i) => (
              <ListRow
                key={i.event.id}
                icon={i.reason === 'possible_duplicate' ? 'copy' : 'help-circle'}
                iconColor={i.reason === 'possible_duplicate' ? colors.indigo : colors.orange}
                title={i.event.title}
                subtitle={[
                  whenWhere(i.event, true),
                  i.reason === 'possible_duplicate' ? `Might be the same as “${i.duplicate?.event.title ?? 'another event'}”` : `From ${i.sourceName ?? 'a new source'}, not yet trusted`,
                ].join('\n')}
                onPress={() => router.push(`/admin/event/${i.event.id}`)}
              />
            ))}
          </ListGroup>
        ) : (
          <EmptyState icon="checkmark-done-circle-outline" title="All Caught Up" message="New events from untrusted sources and possible duplicates appear here." />
        )}
      </View>
    </LargeTitleScrollView>
  );
}

/** Edit an event (§103): edited fields are kept even when sources say otherwise. */
export function AdminEventScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useAdminEvent(id);
  const edit = useEditEvent(id ?? '');
  const clear = useClearOverride(id ?? '');
  const decide = useReviewDecision();
  const [form, setForm] = useState<EventFormState | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Start from the server's copy each time a different version arrives.
  const stamp = data.data ? `${data.data.event.id}:${data.data.event.updatedAt}` : null;
  if (stamp && stamp !== loadedFor) {
    setLoadedFor(stamp);
    setForm(formFromEvent(data.data!.event));
  }

  if (!data.data || !form) {
    return (
      <LargeTitleScrollView title="Edit Event" back>
        <View style={styles.body}>{data.isError ? <ErrorState message={errorMessage(data.error)} onRetry={() => data.refetch()} /> : <Skeleton height={300} round={radius.lg} />}</View>
      </LargeTitleScrollView>
    );
  }

  const { event, overrides, sources } = data.data;
  const original = formFromEvent(event);
  const patch = formPatch(original, form);
  const changed = Object.keys(patch).length > 0;
  const problem = changed ? validateForm(form) : undefined;
  const pending = event.verificationStatus === 'needs_verification';

  const save = () =>
    edit.mutate(patch, {
      onSuccess: () => showToast('Saved. Syncs will keep these changes.', 'checkmark-circle'),
      onError: (error) => showToast(errorMessage(error), 'alert-circle'),
    });

  const review = (approve: boolean) =>
    decide.mutate(
      { id: event.id, approve },
      {
        onSuccess: () => {
          showToast(approve ? 'Approved: visible to everyone' : 'Rejected and hidden', approve ? 'checkmark-circle' : 'trash');
          router.back();
        },
        onError: (error) => showToast(errorMessage(error), 'alert-circle'),
      },
    );

  return (
    <LargeTitleScrollView title="Edit Event" back>
      <View style={styles.body}>
        {pending ? (
          <View style={[styles.banner, { backgroundColor: colors.surface }]}>
            <Text variant="headline">Waiting for review</Text>
            <Text variant="subheadline" tone="secondary">
              Only admins can see it until it’s approved. Correct anything first, then approve.
            </Text>
            <View style={styles.row}>
              <Button title="Approve" icon="checkmark" variant="filled" style={styles.flex} disabled={decide.isPending || changed} onPress={() => review(true)} />
              <Button title="Reject" variant="gray" style={styles.flex} disabled={decide.isPending} onPress={() => review(false)} />
            </View>
          </View>
        ) : null}

        <EventForm value={form} onChange={setForm} overrides={overrides.map((o) => o.field)} />

        <Text variant="footnote" tone={problem ? 'red' : 'secondary'} style={styles.note}>
          {problem ?? (changed ? 'Saving records the change; people following this event see it in their alerts.' : 'No changes yet.')}
        </Text>
        <Button title={edit.isPending ? 'Saving…' : 'Save Changes'} size="large" block disabled={!changed || Boolean(problem) || edit.isPending} onPress={save} />

        <OverrideList overrides={overrides} onClear={(field) => clear.mutate(field)} />

        {sources.length ? (
          <ListGroup header="Sources">
            {sources.map((s) => (
              <ListRow key={s.id} icon="link" iconColor={colors.gray} title={s.name} subtitle={s.lastCheckedAt ? `Checked ${formatRelativePast(new Date(s.lastCheckedAt))}` : undefined} />
            ))}
          </ListGroup>
        ) : null}

        {!pending ? (
          <Pressable onPress={() => review(false)} accessibilityRole="button" style={styles.danger}>
            <Text variant="body" tone="red">
              Remove Event
            </Text>
          </Pressable>
        ) : null}
      </View>
    </LargeTitleScrollView>
  );
}

/** What a page offered when it had no full event details: the rest is typed in. */
const draftToForm = (draft: { title?: string; description?: string; url?: string }): EventFormState => ({
  ...EMPTY_FORM,
  title: draft.title ?? '',
  description: draft.description ?? '',
  officialWebsite: draft.url ?? '',
});

/** Add an event by its page's link, or by hand (§ add event). */
export function AddEventScreen() {
  const [url, setUrl] = useState('');
  const [reading, setReading] = useState(false);
  const [found, setFound] = useState<{ result: ImportDraft; url: string } | null>(null);
  const [form, setForm] = useState<EventFormState | null>(null);
  const create = useCreateEvent();

  const read = async () => {
    setReading(true);
    try {
      const result = await adminRepository.importUrl(url.trim());
      setFound({ result, url: url.trim() });
      setForm(
        result.kind === 'ready'
          ? formFromEvent(result.event)
          : draftToForm({ title: result.draft.title, description: result.draft.description, url: result.draft.officialUrl ?? url.trim() }),
      );
    } catch (error) {
      showToast(errorMessage(error), 'alert-circle');
    } finally {
      setReading(false);
    }
  };

  const problem = form ? validateForm(form) : undefined;
  const save = () => {
    if (!form || problem) return;
    const imageUrl = found?.result.kind === 'ready' ? found.result.event.imageUrl : found?.result.draft.imageUrl;
    create.mutate(formToCreate(form, { sourceUrl: found?.url || undefined, imageUrl: imageUrl || undefined }), {
      onSuccess: (newId) => {
        showToast('Event added', 'checkmark-circle');
        router.replace(`/event/${newId}`);
      },
      onError: (error) => showToast(errorMessage(error), 'alert-circle'),
    });
  };

  return (
    <LargeTitleScrollView title="Add Event" back>
      <View style={styles.body}>
        <ListGroup separatorInset={spacing.lg} footer="Paste the event’s official page. Pages that publish event details fill everything in; otherwise finish the rest below.">
          <FormField value={url} onChangeText={setUrl} placeholder="https://" keyboardType="url" autoCapitalize="none" inputMode="url" returnKeyType="go" onSubmitEditing={read} accessibilityLabel="Event page link" />
        </ListGroup>
        <View style={styles.row}>
          <Button title={reading ? 'Reading…' : 'Read Page'} icon="globe-outline" variant="tinted" style={styles.flex} disabled={!/^https?:\/\/\S+\.\S+/.test(url.trim()) || reading} onPress={read} />
          {!form ? <Button title="Enter by Hand" variant="gray" style={styles.flex} onPress={() => setForm(EMPTY_FORM)} /> : null}
        </View>
        {found ? (
          <Text variant="footnote" tone="secondary" style={styles.note}>
            {found.result.kind === 'ready' ? 'Found the event’s details. Check them, then add.' : 'The page doesn’t list full event details. Add the dates and place below.'}
          </Text>
        ) : null}
        {form ? (
          <>
            <EventForm value={form} onChange={setForm} />
            <Text variant="footnote" tone={problem ? 'red' : 'secondary'} style={styles.note}>
              {problem ?? 'Added events are verified straight away.'}
            </Text>
            <Button title={create.isPending ? 'Adding…' : 'Add Event'} size="large" block disabled={Boolean(problem) || create.isPending} onPress={save} />
          </>
        ) : null}
      </View>
    </LargeTitleScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  banner: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  note: { paddingHorizontal: spacing.xs, marginTop: -spacing.sm },
  danger: { alignSelf: 'center', paddingVertical: spacing.md },
});
