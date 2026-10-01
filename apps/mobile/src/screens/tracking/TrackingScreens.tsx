import { Ionicons } from '@expo/vector-icons';
import type { EventSummary } from '@eii/shared';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { EmptyState, FormField, ListGroup, Text } from '@/components/ui';
import { useEvent } from '@/hooks/useEvents';
import { checklistActions, saveNote, useChecklist, useNote } from '@/hooks/useTracking';
import { useTrackingStore } from '@/store/trackingStore';
import { spacing, typography, useTheme } from '@/theme';

/** The event, from the network, the cache, an offline pack, or the tracked summary — whichever exists. */
function useEventForTracking(): EventSummary | undefined {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useEvent(id).data;
  const summary = useTrackingStore((s) => (id ? s.events[id] : undefined));
  return detail ?? summary;
}

/** Preparation checklist (§48, §82): suggested items plus your own. Ticks work offline. */
export function ChecklistScreen() {
  const { colors } = useTheme();
  const event = useEventForTracking();
  const { id } = useLocalSearchParams<{ id: string }>();
  const items = useChecklist(id ?? '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (!event) return <EmptyState icon="checkmark-circle-outline" title="Event Not Available" message="Open the event again when you’re online." />;
  const actions = checklistActions(event);
  const done = items.filter((i) => i.done).length;

  const add = () => {
    if (!draft.trim()) return;
    actions.add(draft, 100 + items.length);
    setDraft('');
  };

  return (
    <LargeTitleScrollView
      title="Checklist"
      back
      headerRight={
        <Pressable onPress={() => setEditing((e) => !e)} hitSlop={10} accessibilityRole="button">
          <Text variant="body" tone="tint">
            {editing ? 'Done' : 'Edit'}
          </Text>
        </Pressable>
      }
    >
      <View style={styles.body}>
        <Text variant="subheadline" tone="secondary" style={styles.sub} numberOfLines={2}>
          {event.title} · {done} of {items.length} done
        </Text>
        <ListGroup separatorInset={52}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => (editing ? undefined : actions.toggle(item))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.done }}
              aria-checked={item.done}
              accessibilityLabel={item.label}
              style={({ pressed }) => [styles.item, pressed && !editing && { backgroundColor: colors.quaternaryFill }]}
            >
              {editing ? (
                <Pressable onPress={() => actions.remove(item)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${item.label}`}>
                  <Ionicons name="remove-circle" size={24} color={colors.red} />
                </Pressable>
              ) : (
                <Ionicons name={item.done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={item.done ? colors.green : colors.tertiaryLabel} />
              )}
              <Text variant="body" tone={item.done && !editing ? 'secondary' : 'label'} style={[styles.flex, item.done && !editing && styles.doneText]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </ListGroup>
        <ListGroup separatorInset={spacing.lg} footer="Only you see your checklist. It works offline and syncs to your other devices.">
          <FormField value={draft} onChangeText={setDraft} placeholder="Add an item" returnKeyType="done" onSubmitEditing={add} blurOnSubmit={false} accessibilityLabel="Add an item" />
        </ListGroup>
      </View>
    </LargeTitleScrollView>
  );
}

/** One plain note per event (§47, §83). Saved as you type; works offline. Event-level text only. */
export function NoteScreen() {
  const { colors } = useTheme();
  const event = useEventForTracking();
  const { id } = useLocalSearchParams<{ id: string }>();
  const saved = useNote(id ?? '');
  const [text, setText] = useState(saved);
  const lastSaved = useRef(saved);

  // Saves after a short pause in typing, and once more when leaving the screen.
  useEffect(() => {
    if (!event || text === lastSaved.current) return;
    const timer = setTimeout(() => {
      lastSaved.current = text;
      saveNote(event, text);
    }, 700);
    return () => clearTimeout(timer);
  }, [text, event]);
  const latest = useRef({ text, event });
  useEffect(() => {
    latest.current = { text, event };
  }, [text, event]);
  useEffect(
    () => () => {
      const { text: t, event: e } = latest.current;
      if (e && t !== lastSaved.current) saveNote(e, t);
    },
    [],
  );

  if (!event) return <EmptyState icon="document-text-outline" title="Event Not Available" message="Open the event again when you’re online." />;
  return (
    <LargeTitleScrollView title="Note" back>
      <View style={styles.body}>
        <Text variant="subheadline" tone="secondary" style={styles.sub} numberOfLines={2}>
          {event.title}
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoFocus={!saved}
          placeholder="What you want from this event: sessions, stalls, questions to ask…"
          placeholderTextColor={colors.tertiaryLabel}
          style={[typography.body, styles.note, { backgroundColor: colors.surface, color: colors.label }]}
          accessibilityLabel="Note"
        />
        <Text variant="footnote" tone="secondary" style={styles.sub}>
          Only you see your note. It’s saved on this phone as you type and syncs when you’re online.
        </Text>
      </View>
    </LargeTitleScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  sub: { paddingHorizontal: spacing.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 50, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  flex: { flex: 1, minWidth: 0 },
  doneText: { textDecorationLine: 'line-through' },
  note: { minHeight: 280, borderRadius: 14, padding: spacing.lg, textAlignVertical: 'top', outlineStyle: 'none' } as object,
});
