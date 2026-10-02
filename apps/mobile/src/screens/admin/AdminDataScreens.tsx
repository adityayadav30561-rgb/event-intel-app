import { Ionicons } from '@expo/vector-icons';
import { formatDateRange, formatDateTimeIST, formatRelativePast, type DuplicatePair, type EventDetail, type MergeChoice, type ZoneId } from '@eii/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { Button, EmptyState, ErrorState, ListGroup, ListRow, SegmentedControl, showToast, Skeleton, Text, Toggle } from '@/components/ui';
import { useConflicts, useDuplicates, useMerge, useResolveConflict, useRunSync, useSetSource, useSyncInfo } from '@/hooks/useAdmin';
import { errorMessage } from '@/lib/errors';
import { EMPTY_FILTERS, useExploreStore } from '@/store/exploreStore';
import { radius, spacing, useTheme } from '@/theme';

const dates = (e: EventDetail) => formatDateRange(new Date(e.startAt), new Date(e.endAt));
const place = (e: EventDetail) => (e.attendanceMode === 'online' ? 'Online' : [e.venueName, e.city].filter(Boolean).join(', '));

/** Possible duplicates (§101–102). */
export function DuplicatesScreen() {
  const { colors } = useTheme();
  const list = useDuplicates();
  const pairs = list.data ?? [];
  return (
    <LargeTitleScrollView title="Duplicates" back>
      <View style={styles.body}>
        {list.isPending ? (
          <Skeleton height={140} round={radius.lg} />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : pairs.length ? (
          <ListGroup footer="Similar titles in the same place and week. Compare them to merge or keep both.">
            {pairs.map((p) => (
              <ListRow
                key={p.id}
                icon="copy"
                iconColor={colors.indigo}
                title={p.a.title}
                subtitle={`and “${p.b.title}”\n${dates(p.a)} · ${p.a.city} · ${Math.round(p.score * 100)}% alike`}
                onPress={() => router.push(`/admin/duplicate/${p.id}`)}
              />
            ))}
          </ListGroup>
        ) : (
          <EmptyState icon="copy-outline" title="No Possible Duplicates" message="When two sources list what looks like the same event, it appears here." />
        )}
      </View>
    </LargeTitleScrollView>
  );
}

type Side = 'a' | 'b';
const FIELDS: { key: keyof MergeChoice['take']; label: string; value: (e: EventDetail) => string }[] = [
  { key: 'title', label: 'Title', value: (e) => e.title },
  { key: 'dates', label: 'Dates', value: dates },
  { key: 'venue', label: 'Place', value: place },
  { key: 'officialWebsite', label: 'Website', value: (e) => e.officialWebsite ?? '—' },
];

/** Side by side: choose the event to keep and, per field, whose value is right. */
export function DuplicateScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pair: DuplicatePair | undefined = useDuplicates().data?.find((p) => p.id === id);
  const merge = useMerge();
  const [keep, setKeep] = useState<Side>('a');
  const [take, setTake] = useState<MergeChoice['take']>({});

  if (!pair) return <EmptyState icon="copy-outline" title="Already Handled" message="This pair was merged or dismissed." />;
  const pick = (key: keyof MergeChoice['take']) => take[key] ?? keep;

  const run = (choice: MergeChoice | 'dismiss') =>
    merge.mutate(
      { id: pair.id, choice },
      {
        onSuccess: (keptId) => {
          showToast(choice === 'dismiss' ? 'Kept as two events' : 'Merged. Everyone’s plans moved to one event.', 'checkmark-circle');
          if (keptId) router.replace(`/event/${keptId}`);
          else router.back();
        },
        onError: (error) => showToast(errorMessage(error), 'alert-circle'),
      },
    );

  return (
    <LargeTitleScrollView title="Compare" back>
      <View style={styles.body}>
        <SegmentedControl
          segments={[
            { value: 'a', label: 'Keep First' },
            { value: 'b', label: 'Keep Second' },
          ]}
          value={keep}
          onChange={(v) => {
            setKeep(v);
            setTake({});
          }}
        />
        <Text variant="footnote" tone="secondary" style={styles.note}>
          The kept event stays; the other is merged into it with everyone’s saves, notes, checklists and reminders. Tap a value to use it instead.
        </Text>
        {FIELDS.map((f) => (
          <ListGroup key={f.key} header={f.label} separatorInset={spacing.lg}>
            {(['a', 'b'] as const).map((side) => {
              const selected = pick(f.key) === side;
              return (
                <Pressable key={side} onPress={() => setTake((t) => ({ ...t, [f.key]: side }))} accessibilityRole="radio" aria-checked={selected} style={styles.option}>
                  <Text variant="caption1Strong" tone="secondary" style={styles.sideLabel}>
                    {side === 'a' ? '1st' : '2nd'}
                  </Text>
                  <Text variant="body" style={styles.flex}>
                    {f.value(side === 'a' ? pair.a : pair.b)}
                  </Text>
                  {selected ? <Ionicons name="checkmark" size={20} color={colors.tint} /> : null}
                </Pressable>
              );
            })}
          </ListGroup>
        ))}
        <ListGroup header="Sources">
          {(['a', 'b'] as const).map((side) => {
            const e = side === 'a' ? pair.a : pair.b;
            return <ListRow key={side} title={side === 'a' ? 'First' : 'Second'} subtitle={e.sources.map((s) => s.name).join(', ') || 'Unknown'} />;
          })}
        </ListGroup>
        <Button title={merge.isPending ? 'Merging…' : 'Merge'} size="large" block disabled={merge.isPending} onPress={() => run({ keep, take })} />
        <Button title="Not the Same Event" variant="gray" block disabled={merge.isPending} onPress={() => run('dismiss')} />
      </View>
    </LargeTitleScrollView>
  );
}

/** Where sources disagree on date or venue: pick the right one. */
export function ConflictsScreen() {
  const { colors } = useTheme();
  const list = useConflicts();
  const resolve = useResolveConflict();
  const items = list.data ?? [];
  return (
    <LargeTitleScrollView title="Conflicts" back>
      <View style={styles.body}>
        {list.isPending ? (
          <Skeleton height={140} round={radius.lg} />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : items.length ? (
          <>
            <Text variant="footnote" tone="secondary" style={styles.note}>
              Tap the correct value. It’s kept from then on, whatever the sources say.
            </Text>
            {items.map((c) => (
              <ListGroup key={c.id} header={`${c.field === 'date' ? 'Dates' : 'Venue'} · ${c.event.title}`} separatorInset={spacing.lg}>
                {c.values.map((v, index) => (
                  <ListRow
                    key={`${v.sourceName}-${index}`}
                    title={v.label}
                    subtitle={index === 0 ? `${v.sourceName} · shown now` : v.sourceName}
                    trailing={index === 0 ? <Ionicons name="eye" size={16} color={colors.tertiaryLabel} /> : undefined}
                    onPress={() =>
                      resolve.mutate(
                        { id: c.id, index },
                        { onSuccess: () => showToast('Fixed', 'checkmark-circle'), onError: (error) => showToast(errorMessage(error), 'alert-circle') },
                      )
                    }
                  />
                ))}
              </ListGroup>
            ))}
          </>
        ) : (
          <EmptyState icon="git-compare-outline" title="No Conflicts" message="When sources disagree on an event’s dates or venue, the choice appears here." />
        )}
      </View>
    </LargeTitleScrollView>
  );
}

const HEALTH: Record<string, { label: string; tone: 'green' | 'orange' | 'red' | 'secondary' }> = {
  healthy: { label: 'Healthy', tone: 'green' },
  warning: { label: 'Warning', tone: 'orange' },
  failed: { label: 'Failed', tone: 'red' },
  unknown: { label: 'Not run yet', tone: 'secondary' },
};

/** Sync and source health (§96, §107–108): run now, history, and sources on or off. */
export function SyncScreen() {
  const { colors } = useTheme();
  const [polling, setPolling] = useState(false);
  const info = useSyncInfo(polling);
  const run = useRunSync();
  const setSource = useSetSource();
  const data = info.data;
  if (data && polling && !data.running) setPolling(false);

  return (
    <LargeTitleScrollView title="Sync & Sources" back>
      <View style={styles.body}>
        {info.isError && !data ? <ErrorState message={errorMessage(info.error)} onRetry={() => info.refetch()} /> : null}
        {data ? (
          <>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text variant="headline">{data.running ? 'Syncing now…' : data.runs[0] ? `Last sync ${formatRelativePast(new Date(data.runs[0].startedAt))}` : 'Not synced yet'}</Text>
              <Text variant="subheadline" tone="secondary">
                {data.nextSyncAt && !data.running ? `Next automatic sync ${formatDateTimeIST(new Date(data.nextSyncAt))}` : 'Runs every 12 hours.'}
              </Text>
              <Button
                title={data.running ? 'Running…' : 'Run Sync Now'}
                icon="sync"
                variant="tinted"
                disabled={data.running || run.isPending}
                onPress={() =>
                  run.mutate(undefined, {
                    onSuccess: (started) => {
                      if (started) setPolling(true);
                      showToast(started ? 'Sync started' : 'A sync is already running', 'sync');
                    },
                  })
                }
              />
            </View>

            {/* Older servers (and data cached from them) don't send coverage. */}
            {data.coverage ? (
              <ListGroup header="Upcoming Events by Region" footer="Events everyone can see that haven’t ended yet. Regions with few events need more sources (docs/SOURCES.md).">
                {data.coverage.zones.map((z) => (
                  <ListRow
                    key={z.id}
                    icon="map"
                    iconColor={z.upcoming >= 10 ? colors.green : z.upcoming ? colors.orange : colors.red}
                    title={z.name}
                    detail={String(z.upcoming)}
                    onPress={() => {
                      useExploreStore.getState().set({ ...EMPTY_FILTERS, place: { kind: 'zone', id: z.id as ZoneId }, view: 'list' });
                      router.navigate('/explore');
                    }}
                  />
                ))}
                <ListRow icon="globe" iconColor={colors.indigo} title="Online" detail={String(data.coverage.online)} />
              </ListGroup>
            ) : null}

            <ListGroup header="Sources" footer="A switch set here stays after restarts. Each source’s terms were checked (docs/SOURCES.md): Salesforce and Google groups need your decision first, and BIEC and dev.events refuse our server.">
              {data.sources.map((s) => (
                <ListRow
                  key={s.id}
                  title={s.name}
                  subtitle={[
                    `${HEALTH[s.health]?.label ?? s.health}${s.enabled ? ` · ${s.eventsFound} events` : ''}`,
                    s.lastSuccessAt ? `Read ${formatRelativePast(new Date(s.lastSuccessAt))}` : undefined,
                    s.health === 'failed' && s.lastError ? s.lastError : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={<Toggle value={s.enabled} onValueChange={(on) => setSource.mutate({ id: s.id, enabled: on })} accessibilityLabel={`${s.name} on or off`} />}
                />
              ))}
            </ListGroup>

            {data.runs.length ? (
              <ListGroup header="Recent Syncs">
                {data.runs.map((r) => (
                  <ListRow
                    key={r.id}
                    icon={r.status === 'success' ? 'checkmark-circle' : r.status === 'running' ? 'time' : 'alert-circle'}
                    iconColor={r.status === 'success' ? colors.green : r.status === 'running' ? colors.blue : colors.orange}
                    title={formatDateTimeIST(new Date(r.startedAt))}
                    subtitle={`${r.created} new · ${r.updated} updated · ${r.duplicates} merged · ${r.skipped} skipped${r.sources.some((s) => s.status === 'failed') ? ` · failed: ${r.sources.filter((s) => s.status === 'failed').map((s) => s.sourceName).join(', ')}` : ''}`}
                  />
                ))}
              </ListGroup>
            ) : null}
          </>
        ) : info.isPending ? (
          <Skeleton height={200} round={radius.lg} />
        ) : null}
      </View>
    </LargeTitleScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  note: { paddingHorizontal: spacing.xs },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  sideLabel: { width: 28 },
  flex: { flex: 1, minWidth: 0 },
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
});
