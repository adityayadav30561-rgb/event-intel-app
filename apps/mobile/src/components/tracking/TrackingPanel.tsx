import { Ionicons } from '@expo/vector-icons';
import { formatIsoDay, istEventDays, REMINDER_OFFSETS, reminderLabel, VISIT_STATUS_LABELS, VISIT_STATUSES, type EventDetail, type VisitStatus } from '@eii/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Button, ListGroup, ListRow, Sheet, showToast, Text, Toggle as Switch } from '@/components/ui';
import { useReminders, useToggleReminder } from '@/hooks/useAlerts';
import { useNow } from '@/hooks/useNow';
import { errorMessage } from '@/lib/errors';
import { accountRepository } from '@/repositories';
import { analytics } from '@/services/analytics';
import { openExternal } from '@/services/links';
import { trackingActions, useChecklist, useNote, useTracked, useVisitors } from '@/hooks/useTracking';
import { removePack, savePack, useHasPack } from '@/services/offlinePacks';
import { radius, spacing, typography, useTheme } from '@/theme';

const PLANNED: VisitStatus[] = ['planning', 'confirmed', 'visiting'];
const STATUS_ICON: Record<VisitStatus, keyof typeof Ionicons.glyphMap> = {
  planning: 'walk',
  confirmed: 'checkmark-circle',
  visiting: 'location',
  visited: 'flag',
  not_visited: 'close-circle',
};

/** How a teammate's plan reads in "Also going: Rahul (confirmed)". */
const TEAM_STATUS: Record<VisitStatus, string> = { planning: 'planning', confirmed: 'confirmed', visiting: 'there now', visited: 'went', not_visited: 'not going' };

/** Save, follow and plan a visit (§43–48, §133–134), on the event page. Works offline. */
export function TrackingPanel({ event }: { event: EventDetail }) {
  const { colors } = useTheme();
  const tracked = useTracked(event.id);
  const actions = useMemo(() => trackingActions(event), [event]);
  const checklist = useChecklist(event.id);
  const note = useNote(event.id);
  const offline = useHasPack(event.id);
  const others = (useVisitors(event.id).data ?? []).filter((v) => !v.isYou);
  const [sheet, setSheet] = useState<'status' | 'day' | 'travel' | 'remind' | 'calendar' | null>(null);
  const myReminders = (useReminders().data ?? []).filter((r) => r.eventId === event.id && !r.sentAt);
  const toggleReminder = useToggleReminder(event.id);
  const now = useNow();

  const status = tracked?.status ?? null;
  const planned = Boolean(status && PLANNED.includes(status));
  const ended = new Date(event.endAt).getTime() < now;
  const days = istEventDays(new Date(event.startAt), new Date(event.endAt));
  const done = checklist.filter((i) => i.done).length;

  const setStatus = (value: VisitStatus | null) => {
    actions.setStatus(value);
    setSheet(null);
    // Planning a visit keeps the event's details on the phone for the venue.
    if (value && PLANNED.includes(value) && !offline) void savePack(event).then(() => showToast('Saved for offline use', 'cloud-done'));
  };

  const toggleOffline = (on: boolean) => {
    if (on) void savePack(event).then(() => showToast('Saved for offline use', 'cloud-done'));
    else void removePack(event.id);
  };

  const visitorsLine = others.length ? `Also going: ${others.map((v) => `${v.name} (${TEAM_STATUS[v.status]})`).join(', ')}` : undefined;

  return (
    <View style={styles.block}>
      {ended && planned ? (
        <View style={[styles.prompt, { backgroundColor: colors.surface }]}>
          <Text variant="headline">Did you visit?</Text>
          <View style={styles.promptButtons}>
            <Button title="Visited" icon="flag" variant="tinted" style={styles.flex} onPress={() => actions.setStatus('visited')} />
            <Button title="Didn’t Go" variant="gray" style={styles.flex} onPress={() => actions.setStatus('not_visited')} />
          </View>
        </View>
      ) : null}

      <View style={styles.toggles}>
        <SaveToggle icon="bookmark" label={tracked?.saved ? 'Saved' : 'Save'} active={Boolean(tracked?.saved)} onPress={() => actions.setSaved(!tracked?.saved)} />
        <SaveToggle
          icon="notifications"
          label={tracked?.following ? 'Following' : 'Follow'}
          active={Boolean(tracked?.following)}
          onPress={() => {
            actions.setFollowing(!tracked?.following);
            if (!tracked?.following) showToast('Following: changes show in My Events', 'notifications');
          }}
        />
      </View>

      <ListGroup footer={visitorsLine}>
        <ListRow
          icon={status ? STATUS_ICON[status] : 'walk'}
          iconColor={status === 'visited' ? colors.green : status === 'not_visited' ? colors.gray : colors.orange}
          title="Visit"
          detail={status ? VISIT_STATUS_LABELS[status] : ended ? 'Not recorded' : 'Not planned'}
          onPress={() => setSheet('status')}
        />
        {planned && days.length > 1 ? (
          <ListRow icon="calendar-clear" iconColor={colors.red} title="Visit Day" detail={tracked?.visitDate ? formatIsoDay(tracked.visitDate) : 'Choose'} onPress={() => setSheet('day')} />
        ) : null}
        {planned ? (
          <ListRow icon="train" iconColor={colors.teal} title="Travel Notes" subtitle={tracked?.travelNotes ?? undefined} detail={tracked?.travelNotes ? undefined : 'Add'} titleLines={1} onPress={() => setSheet('travel')} />
        ) : null}
        <ListRow icon="checkmark-circle" iconColor={colors.green} title="Checklist" detail={`${done} of ${checklist.length}`} onPress={() => router.push(`/event/${event.id}/checklist`)} />
        <ListRow
          icon="document-text"
          iconColor={colors.yellow}
          title="Note"
          subtitle={note ? note.split('\n')[0] : undefined}
          detail={note ? undefined : 'Add'}
          onPress={() => router.push(`/event/${event.id}/note`)}
        />
        {!ended ? (
          <ListRow
            icon="alarm"
            iconColor={colors.blue}
            title="Remind Me"
            detail={myReminders.length ? myReminders.map((r) => reminderLabel(r.offsetMinutes).replace(' before', '')).join(', ') : 'Off'}
            onPress={() => setSheet('remind')}
          />
        ) : null}
        {!ended ? <ListRow icon="calendar" iconColor={colors.red} title="Add to Calendar" onPress={() => setSheet('calendar')} /> : null}
        <ListRow
          icon="cloud-download"
          iconColor={colors.indigo}
          title="Available Offline"
          trailing={<Switch value={offline} onValueChange={toggleOffline} accessibilityLabel="Available offline" />}
        />
      </ListGroup>

      <Sheet visible={sheet === 'status'} onClose={() => setSheet(null)} title="Visit" actionLabel="Cancel">
        <View style={styles.sheetBody}>
          <ListGroup separatorInset={spacing.lg}>
            {[null, ...VISIT_STATUSES].map((s) => (
              <ListRow
                key={s ?? 'none'}
                title={s ? VISIT_STATUS_LABELS[s] : 'Not Planned'}
                trailing={status === s ? <Ionicons name="checkmark" size={20} color={colors.tint} /> : undefined}
                onPress={() => setStatus(s)}
              />
            ))}
          </ListGroup>
        </View>
      </Sheet>

      <Sheet visible={sheet === 'day'} onClose={() => setSheet(null)} title="Visit Day" actionLabel="Cancel">
        <View style={styles.sheetBody}>
          <ListGroup separatorInset={spacing.lg}>
            {[null, ...days].map((d) => (
              <ListRow
                key={d ?? 'none'}
                title={d ? formatIsoDay(d) : 'Not Decided'}
                trailing={(tracked?.visitDate ?? null) === d ? <Ionicons name="checkmark" size={20} color={colors.tint} /> : undefined}
                onPress={() => {
                  actions.setVisitDate(d);
                  setSheet(null);
                }}
              />
            ))}
          </ListGroup>
        </View>
      </Sheet>

      <Sheet visible={sheet === 'remind'} onClose={() => setSheet(null)} title="Remind Me">
        <View style={styles.sheetBody}>
          <ListGroup separatorInset={spacing.lg} footer="Reminders arrive as alerts (turn them on in More → Notifications) and always appear in the inbox. They follow the event if its date changes.">
            {REMINDER_OFFSETS.filter((o) => new Date(event.startAt).getTime() - o.minutes * 60_000 > now).map((o) => {
              const existing = myReminders.find((r) => r.offsetMinutes === o.minutes);
              return (
                <ListRow
                  key={o.minutes}
                  title={o.label}
                  trailing={existing ? <Ionicons name="checkmark" size={20} color={colors.tint} /> : undefined}
                  onPress={() =>
                    toggleReminder.mutate(
                      { offsetMinutes: o.minutes, existing },
                      { onError: (error) => showToast(errorMessage(error), 'alert-circle') },
                    )
                  }
                />
              );
            })}
          </ListGroup>
        </View>
      </Sheet>

      <CalendarSheet visible={sheet === 'calendar'} eventId={event.id} onClose={() => setSheet(null)} />

      <TravelNotesSheet visible={sheet === 'travel'} initial={tracked?.travelNotes ?? ''} onClose={() => setSheet(null)} onSave={actions.setTravelNotes} />
    </View>
  );
}

function SaveToggle({ icon, label, active, onPress }: { icon: 'bookmark' | 'notifications'; label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const fg = active ? colors.onTint : colors.tint;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      aria-checked={active}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.toggle, { backgroundColor: active ? colors.tint : colors.surface }, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={active ? icon : `${icon}-outline`} size={19} color={fg} />
      <Text variant="headline" style={{ color: fg }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Add to the phone's calendar (§51): the calendar file, or Google Calendar. Asked for only on tap. */
function CalendarSheet({ visible, eventId, onClose }: { visible: boolean; eventId: string; onClose: () => void }) {
  const [busy, setBusy] = useState<'ics' | 'google' | null>(null);
  const open = async (kind: 'ics' | 'google') => {
    analytics.track('calendar_add', { kind });
    setBusy(kind);
    try {
      const links = await accountRepository.calendarLinks(eventId);
      if (kind === 'ics') window.location.href = links.icsUrl;
      else openExternal(links.googleUrl);
      onClose();
    } catch (error) {
      showToast(errorMessage(error), 'alert-circle');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Add to Calendar" actionLabel="Cancel">
      <View style={styles.sheetBody}>
        <ListGroup separatorInset={spacing.lg} footer="Your phone shows the event first, so you can check it before adding.">
          <ListRow icon="calendar" iconColor="#FF3B30" title={busy === 'ics' ? 'Opening…' : 'Calendar (iPhone, Outlook)'} onPress={() => void open('ics')} />
          <ListRow icon="logo-google" iconColor="#4285F4" title={busy === 'google' ? 'Opening…' : 'Google Calendar'} onPress={() => void open('google')} />
        </ListGroup>
      </View>
    </Sheet>
  );
}

function TravelNotesSheet({ visible, initial, onClose, onSave }: { visible: boolean; initial: string; onClose: () => void; onSave: (text: string) => void }) {
  const { colors } = useTheme();
  const [text, setText] = useState(initial);
  const [shownFor, setShownFor] = useState(visible);
  // Start from the saved notes each time the sheet opens.
  if (visible !== shownFor) {
    setShownFor(visible);
    if (visible) setText(initial);
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Travel Notes" actionLabel="Cancel">
      <View style={styles.sheetBody}>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder="Train or flight, hotel, who’s going, when to leave…"
          placeholderTextColor={colors.tertiaryLabel}
          style={[typography.body, styles.textArea, { backgroundColor: colors.surface, color: colors.label }]}
          accessibilityLabel="Travel notes"
        />
        <Button
          title="Save"
          size="large"
          block
          onPress={() => {
            onSave(text);
            onClose();
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: spacing.lg, marginTop: spacing.xxl, gap: spacing.md },
  toggles: { flexDirection: 'row', gap: spacing.md },
  toggle: { flex: 1, height: 48, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  prompt: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  promptButtons: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
  textArea: { minHeight: 140, borderRadius: radius.lg, padding: spacing.lg, textAlignVertical: 'top', outlineStyle: 'none' } as object,
});
