import { formatTime, formatWeekdayDate, normalizeText, type Exhibitor, type Speaker } from '@eii/shared';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LargeTitleFlatList, LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { Avatar, EmptyState, ErrorState, ListGroup, ListRow, SearchField, SegmentedControl, Skeleton, Text } from '@/components/ui';
import { useEvent } from '@/hooks/useEvents';
import { radius, spacing, useTheme } from '@/theme';
import { AGENDA_TEXT_INSET, AgendaRow } from './EventDetailScreen';

function useEventParam() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return useEvent(id);
}

function ListSkeleton() {
  return (
    <View style={styles.skeleton}>
      <Skeleton height={64} round={radius.lg} />
      <Skeleton height={64} round={radius.lg} />
      <Skeleton height={64} round={radius.lg} />
    </View>
  );
}

/** Every speaker at an event (spec §37). */
export function SpeakersScreen() {
  const event = useEventParam();
  const { colors } = useTheme();
  const speakers = event.data?.speakers ?? [];
  return (
    <LargeTitleFlatList<Speaker>
      title="Speakers"
      back
      listHeader={event.data ? <Text variant="subheadline" tone="secondary" style={styles.sub}>{event.data.title}</Text> : null}
      data={speakers}
      keyExtractor={(s) => s.id}
      renderItem={({ item, index }) => (
        <View style={[styles.cell, { backgroundColor: colors.surface }, index === 0 && styles.first, index === speakers.length - 1 && styles.last]}>
          <ListRow
            title={item.name}
            subtitle={[[item.designation, item.company].filter(Boolean).join(', '), item.topic].filter(Boolean).join('\n')}
            leading={<Avatar name={item.name} size={44} />}
          />
          {index < speakers.length - 1 ? <View style={[styles.sep, { backgroundColor: colors.separator }]} /> : null}
        </View>
      )}
      ListEmptyComponent={event.isPending ? <ListSkeleton /> : event.isError ? <ErrorState onRetry={() => event.refetch()} /> : <EmptyState icon="people-outline" title="No Speakers Listed" />}
    />
  );
}

/** Exhibitors with search (spec §38). */
export function ExhibitorsScreen() {
  const event = useEventParam();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const exhibitors = useMemo(() => {
    const q = normalizeText(query);
    const all = event.data?.exhibitors ?? [];
    return q ? all.filter((x) => normalizeText(`${x.company} ${x.industry ?? ''} ${x.booth ?? ''}`).includes(q)) : all;
  }, [event.data, query]);
  return (
    <LargeTitleFlatList<Exhibitor>
      title="Exhibitors"
      back
      accessory={<SearchField value={query} onChangeText={setQuery} onClear={() => setQuery('')} placeholder="Search exhibitors" />}
      listHeader={
        event.data ? (
          <Text variant="subheadline" tone="secondary" style={styles.sub}>
            {exhibitors.length} of {event.data.exhibitors.length} at {event.data.title}
          </Text>
        ) : null
      }
      data={exhibitors}
      keyExtractor={(x) => x.id}
      renderItem={({ item, index }) => (
        <View style={[styles.cell, { backgroundColor: colors.surface }, index === 0 && styles.first, index === exhibitors.length - 1 && styles.last]}>
          <ListRow title={item.company} subtitle={[item.booth, item.industry].filter(Boolean).join(' · ')} leading={<Avatar name={item.company} size={38} />} />
          {index < exhibitors.length - 1 ? <View style={[styles.sep, { backgroundColor: colors.separator }]} /> : null}
        </View>
      )}
      ListEmptyComponent={
        event.isPending ? <ListSkeleton /> : event.isError ? <ErrorState onRetry={() => event.refetch()} /> : <EmptyState icon="storefront-outline" title="No Matches" message="Try another company name or booth." />
      }
    />
  );
}

/** Day-by-day agenda (spec §39). */
export function AgendaScreen() {
  const event = useEventParam();
  const agenda = useMemo(() => event.data?.agenda ?? [], [event.data]);
  const days = useMemo(() => [...new Set(agenda.map((a) => a.day))].sort((a, b) => a - b), [agenda]);
  const [day, setDay] = useState('1');
  const start = event.data ? new Date(event.data.startAt) : undefined;
  const dayDate = (d: number) => (start ? new Date(start.getTime() + (d - 1) * 86_400_000) : undefined);
  const items = agenda.filter((a) => String(a.day) === day);
  const speakerName = (ids?: string[]) => event.data?.speakers.find((s) => ids?.includes(s.id))?.name;

  return (
    <LargeTitleScrollView
      title="Agenda"
      back
      accessory={
        days.length > 1 ? (
          <SegmentedControl
            value={day}
            onChange={setDay}
            segments={days.map((d) => ({ value: String(d), label: days.length > 3 ? `Day ${d}` : `Day ${d} · ${formatWeekdayDate(dayDate(d)!).split(',')[0]}` }))}
          />
        ) : undefined
      }
    >
      <View style={styles.agenda}>
        {event.isPending ? (
          <ListSkeleton />
        ) : event.isError ? (
          <ErrorState onRetry={() => event.refetch()} />
        ) : !agenda.length ? (
          <EmptyState icon="list-outline" title="No Agenda Yet" message="The organizer hasn't published the programme." />
        ) : (
          <ListGroup header={dayDate(Number(day)) ? formatWeekdayDate(dayDate(Number(day))!) : undefined} separatorInset={AGENDA_TEXT_INSET}>
            {items.map((item) => (
              <AgendaRow
                key={item.id}
                time={formatTime(new Date(item.startsAt))}
                end={item.endsAt ? formatTime(new Date(item.endsAt)) : undefined}
                title={item.title}
                room={item.room}
                speaker={speakerName(item.speakerIds)}
              />
            ))}
          </ListGroup>
        )}
      </View>
    </LargeTitleScrollView>
  );
}

const styles = StyleSheet.create({
  sub: { paddingHorizontal: spacing.lg + spacing.xs, paddingBottom: spacing.md },
  cell: { marginHorizontal: spacing.lg },
  first: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  last: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 72 },
  skeleton: { paddingHorizontal: spacing.lg, gap: spacing.md },
  agenda: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
