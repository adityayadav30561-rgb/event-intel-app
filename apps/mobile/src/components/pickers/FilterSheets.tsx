import { CATEGORIES, DATE_PRESET_LABELS, DATE_PRESETS, EVENT_TYPE_LABELS, EVENT_TYPES, type DatePreset, type EventType } from '@eii/shared';
import type { Ionicons } from '@expo/vector-icons';
import { Sheet } from '@/components/ui';
import { useTheme, type ColorTokens } from '@/theme';
import { OptionList } from './OptionList';

/** iOS colour for each artwork palette, used for category icon tiles. */
export const paletteColor = (c: ColorTokens, palette: string) =>
  ({ blue: c.blue, indigo: c.indigo, violet: c.purple, teal: c.teal, green: c.green, orange: c.orange, amber: c.orange, rose: c.pink, slate: c.gray, sky: c.blue })[palette] ?? c.blue;

export function DateSheet({ visible, onClose, value, onChange }: { visible: boolean; onClose: () => void; value: DatePreset | null; onChange: (v: DatePreset | null) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Dates" scroll>
      <OptionList
        groups={[{ options: [{ value: null, label: 'Any Date' }, ...DATE_PRESETS.map((p) => ({ value: p as DatePreset | null, label: DATE_PRESET_LABELS[p] }))] }]}
        selected={value}
        onSelect={(v) => {
          onChange(v);
          onClose();
        }}
      />
    </Sheet>
  );
}

export function CategorySheet({ visible, onClose, value, onChange }: { visible: boolean; onClose: () => void; value: string | null; onChange: (v: string | null) => void }) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="Category" scroll>
      <OptionList
        groups={[
          { options: [{ value: null, label: 'All Categories', icon: 'apps', iconColor: colors.gray }] },
          {
            options: CATEGORIES.map((c) => ({
              value: c.id as string | null,
              label: c.name,
              icon: c.icon as keyof typeof Ionicons.glyphMap,
              iconColor: paletteColor(colors, c.palette),
            })),
          },
        ]}
        selected={value}
        onSelect={(v) => {
          onChange(v);
          onClose();
        }}
      />
    </Sheet>
  );
}

/** The most common formats first; the rest follow alphabetically. */
const COMMON: EventType[] = ['conference', 'expo', 'exhibition', 'trade_show', 'summit', 'workshop', 'meetup', 'seminar'];

export function EventTypeSheet({ visible, onClose, value, onChange }: { visible: boolean; onClose: () => void; value: EventType | null; onChange: (v: EventType | null) => void }) {
  const rest = EVENT_TYPES.filter((t) => !COMMON.includes(t)).sort((a, b) => EVENT_TYPE_LABELS[a].localeCompare(EVENT_TYPE_LABELS[b]));
  const option = (t: EventType) => ({ value: t as EventType | null, label: EVENT_TYPE_LABELS[t] });
  return (
    <Sheet visible={visible} onClose={onClose} title="Event Type" scroll>
      <OptionList
        groups={[{ options: [{ value: null, label: 'All Types' }, ...COMMON.map(option)] }, { header: 'More Types', options: rest.map(option) }]}
        selected={value}
        onSelect={(v) => {
          onChange(v);
          onClose();
        }}
      />
    </Sheet>
  );
}
