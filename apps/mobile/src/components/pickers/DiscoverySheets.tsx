import { INDUSTRIES, TECHNOLOGIES, type AttendanceMode, type EventSort } from '@eii/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Chip, FormField, ListGroup, SegmentedControl, Sheet, Text } from '@/components/ui';
import { EMPTY_FILTERS, type ExploreFilters } from '@/store/exploreStore';
import { spacing } from '@/theme';
import { OptionList } from './OptionList';

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** ERP/CRM generic technologies are covered by the topics; people pick the products. */
const PICKABLE_TECHNOLOGIES = TECHNOLOGIES.filter((t) => !['erp-generic', 'crm-generic'].includes(t.id));
const MODES: { value: AttendanceMode; label: string }[] = [
  { value: 'in_person', label: 'In Person' },
  { value: 'online', label: 'Online' },
  { value: 'hybrid', label: 'Hybrid' },
];

function Section({ title, footer, children }: { title: string; footer?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      {children}
      {footer ? (
        <Text variant="footnote" tone="secondary">
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/** Everything beyond the quick chips (§17): technology, industry, attendance, price, match. */
export function FiltersSheet({ visible, onClose, filters, onChange }: { visible: boolean; onClose: () => void; filters: ExploreFilters; onChange: (patch: Partial<ExploreFilters>) => void }) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      scroll
      secondaryAction={{
        label: 'Reset',
        onPress: () =>
          onChange({
            technologyIds: EMPTY_FILTERS.technologyIds,
            industryIds: EMPTY_FILTERS.industryIds,
            attendanceModes: EMPTY_FILTERS.attendanceModes,
            price: null,
            minMatch: null,
          }),
      }}
    >
      <View style={styles.body}>
        <Section title="Match" footer="How well events fit the interests you chose in More → Interests.">
          <SegmentedControl
            segments={[
              { value: 'any', label: 'Any' },
              { value: 'good', label: 'Good or Better' },
              { value: 'strong', label: 'Strong' },
            ]}
            value={filters.minMatch ?? 'any'}
            onChange={(v) => onChange({ minMatch: v === 'any' ? null : v })}
          />
        </Section>
        <Section title="Price">
          <SegmentedControl
            segments={[
              { value: 'any', label: 'Any' },
              { value: 'free', label: 'Free' },
              { value: 'paid', label: 'Paid' },
            ]}
            value={filters.price ?? 'any'}
            onChange={(v) => onChange({ price: v === 'any' ? null : v })}
          />
        </Section>
        <Section title="Attendance">
          <View style={styles.chips}>
            {MODES.map((m) => {
              const on = filters.attendanceModes.includes(m.value);
              return <Chip key={m.value} label={m.label} selected={on} icon={on ? 'checkmark' : undefined} onPress={() => onChange({ attendanceModes: toggle(filters.attendanceModes, m.value) })} />;
            })}
          </View>
        </Section>
        <Section title="Technologies">
          <View style={styles.chips}>
            {PICKABLE_TECHNOLOGIES.map((t) => {
              const on = filters.technologyIds.includes(t.id);
              return <Chip key={t.id} label={t.name} selected={on} icon={on ? 'checkmark' : undefined} onPress={() => onChange({ technologyIds: toggle(filters.technologyIds, t.id) })} />;
            })}
          </View>
        </Section>
        <Section title="Industries">
          <View style={styles.chips}>
            {INDUSTRIES.map((t) => {
              const on = filters.industryIds.includes(t.id);
              return <Chip key={t.id} label={t.name} selected={on} icon={on ? 'checkmark' : undefined} onPress={() => onChange({ industryIds: toggle(filters.industryIds, t.id) })} />;
            })}
          </View>
        </Section>
      </View>
    </Sheet>
  );
}

export const SORT_LABELS: Record<EventSort, string> = {
  date: 'Date',
  relevance: 'Best Text Match',
  match: 'Best for You',
  distance: 'Nearest',
  recently_added: 'Recently Added',
  recently_updated: 'Recently Updated',
};

/** Sort (§17): date, best for you, newest, recently updated; nearest with a location; best text match while searching. */
export function SortSheet({ visible, onClose, value, onChange, hasText, hasLocation }: { visible: boolean; onClose: () => void; value: EventSort | null; onChange: (v: EventSort | null) => void; hasText: boolean; hasLocation: boolean }) {
  const sorts: EventSort[] = ['date', 'match', ...(hasLocation ? (['distance'] as const) : []), ...(hasText ? (['relevance'] as const) : []), 'recently_added', 'recently_updated'];
  const current = value ?? (hasLocation ? 'distance' : hasText ? 'relevance' : 'date');
  return (
    <Sheet visible={visible} onClose={onClose} title="Sort By">
      <OptionList
        groups={[{ options: sorts.map((s) => ({ value: s as EventSort | null, label: SORT_LABELS[s] })) }]}
        selected={current}
        onSelect={(v) => {
          onChange(v);
          onClose();
        }}
      />
    </Sheet>
  );
}

export const RADII = [10, 25, 50, 100] as const;

/** Distance around your location (§85–86); or stop using it. */
export function NearSheet({ visible, onClose, radiusKm, onChange, onStop }: { visible: boolean; onClose: () => void; radiusKm: number; onChange: (km: number) => void; onStop: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Near Me">
      <OptionList
        groups={[
          { options: RADII.map((km) => ({ value: km as number | null, label: `Within ${km} km` })) },
          { options: [{ value: null, label: 'Stop Using My Location', icon: 'location-outline' }] },
        ]}
        selected={radiusKm}
        onSelect={(v) => {
          if (v === null) onStop();
          else onChange(v);
          onClose();
        }}
      />
      <Text variant="footnote" tone="secondary" style={styles.note}>
        Your location is used only for this search, on this phone. It isn’t saved or shared.
      </Text>
    </Sheet>
  );
}

/** Name a search to keep it (§68). */
export function SaveSearchSheet({ visible, onClose, suggestedName, onSave, saving, error }: { visible: boolean; onClose: () => void; suggestedName: string; onSave: (name: string) => void; saving: boolean; error?: string }) {
  const [name, setName] = useState(suggestedName);
  const [shownFor, setShownFor] = useState(visible);
  if (visible !== shownFor) {
    setShownFor(visible);
    if (visible) setName(suggestedName);
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Save Search" actionLabel="Cancel">
      <View style={styles.body}>
        <ListGroup separatorInset={spacing.lg} footer="Open it from Explore any time to see the latest matches. Alerts about new matches come with notifications.">
          <FormField value={name} onChangeText={setName} placeholder="Name" autoCapitalize="sentences" returnKeyType="done" onSubmitEditing={() => name.trim() && onSave(name.trim())} accessibilityLabel="Name" />
        </ListGroup>
        {error ? (
          <Text variant="footnote" tone="red">
            {error}
          </Text>
        ) : null}
        <Button title={saving ? 'Saving…' : 'Save'} size="large" block disabled={!name.trim() || saving} onPress={() => onSave(name.trim())} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xl },
  section: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xl },
});
