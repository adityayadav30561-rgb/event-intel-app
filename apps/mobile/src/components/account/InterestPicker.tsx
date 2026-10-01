import {
  CATEGORIES,
  CITIES,
  EVENT_TYPE_LABELS,
  EVENT_TYPES,
  INDUSTRIES,
  TECHNOLOGIES,
  type EventType,
  type Preferences,
} from '@eii/shared';
import { StyleSheet, View } from 'react-native';
import { Chip, Text } from '@/components/ui';
import { spacing } from '@/theme';

type Field = keyof Preferences;
type Option = { id: string; label: string };

/** "ERP" and "CRM" exist as technologies only so feeds can say "ERP"; people pick the topics. */
const HIDDEN_TECHNOLOGIES = new Set(['erp-generic', 'crm-generic']);

export const INTEREST_OPTIONS: Record<Field, Option[]> = {
  technologyIds: TECHNOLOGIES.filter((t) => !HIDDEN_TECHNOLOGIES.has(t.id)).map((t) => ({ id: t.id, label: t.name })),
  categoryIds: CATEGORIES.map((t) => ({ id: t.id, label: t.name })),
  industryIds: INDUSTRIES.map((t) => ({ id: t.id, label: t.name })),
  eventTypes: EVENT_TYPES.map((t) => ({ id: t, label: EVENT_TYPE_LABELS[t] })),
  cityIds: [...CITIES.filter((c) => c.popular).map((c) => ({ id: c.id, label: c.name })), { id: 'online', label: 'Online' }],
};

export const INTEREST_TITLES: Record<Field, string> = {
  technologyIds: 'Technologies',
  categoryIds: 'Topics',
  industryIds: 'Industries',
  eventTypes: 'Event Types',
  cityIds: 'Cities',
};

export function toggleInterest(prefs: Preferences, field: Field, id: string): Preferences {
  const list = prefs[field] as string[];
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  return { ...prefs, [field]: field === 'eventTypes' ? (next as EventType[]) : next };
}

/** One group of selectable interests. Selected chips are filled and ticked (never colour alone). */
export function InterestSection({
  field,
  prefs,
  onChange,
  title = INTEREST_TITLES[field],
  footer,
  showTitle = true,
}: {
  field: Field;
  prefs: Preferences;
  onChange: (prefs: Preferences) => void;
  title?: string;
  footer?: string;
  showTitle?: boolean;
}) {
  const selected = new Set(prefs[field] as string[]);
  return (
    <View style={styles.section}>
      {showTitle ? (
        <Text variant="title3" accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      ) : null}
      <View style={styles.chips}>
        {INTEREST_OPTIONS[field].map((option) => (
          <Chip
            key={option.id}
            label={option.label}
            selected={selected.has(option.id)}
            icon={selected.has(option.id) ? 'checkmark' : undefined}
            onPress={() => onChange(toggleInterest(prefs, field, option.id))}
          />
        ))}
      </View>
      {footer ? (
        <Text variant="footnote" tone="secondary" style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  title: { paddingHorizontal: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: { paddingHorizontal: spacing.xs },
});
