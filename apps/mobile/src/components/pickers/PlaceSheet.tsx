import { CITIES, normalizeText, REGIONS } from '@eii/shared';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SearchField, Sheet } from '@/components/ui';
import { useCityCounts } from '@/hooks/useEvents';
import type { Place } from '@/store/placeStore';
import { spacing } from '@/theme';
import { OptionList, type Option } from './OptionList';

const samePlace = (a: Place | null, b: Place | null) =>
  a === b || (a !== null && b !== null && a.kind === b.kind && ('id' in a ? a.id : '') === ('id' in b ? b.id : ''));

type Props = {
  visible: boolean;
  onClose: () => void;
  value: Place | null;
  onChange: (place: Place | null) => void;
  /** Explore allows "Any location" (no filter); Home always has a place. */
  allowAny?: boolean;
};

/** Pick All India, a metro region or a city, with upcoming event counts. */
export function PlaceSheet({ visible, onClose, value, onChange, allowAny }: Props) {
  const [query, setQuery] = useState('');
  const counts = useCityCounts();
  const countOf = useMemo(() => new Map(counts.data?.map((c) => [c.cityId, c.count])), [counts.data]);
  const label = (n: number | undefined) => (n ? `${n}` : undefined);

  const groups = useMemo(() => {
    const q = normalizeText(query);
    const matches = (name: string, aliases: string[] = []) => !q || [name, ...aliases].some((n) => normalizeText(n).includes(q));
    const regionCount = (id: string) => CITIES.filter((c) => c.region === id).reduce((sum, c) => sum + (countOf.get(c.id) ?? 0), 0);

    const top: Option<Place | null>[] = [];
    if (!q) top.push(allowAny ? { value: null, label: 'Any Location', icon: 'globe-outline' } : { value: { kind: 'india' }, label: 'All India', icon: 'globe-outline' });
    const regions: Option<Place | null>[] = REGIONS.filter((r) => matches(r.name, r.aliases)).map((r) => ({
      value: { kind: 'region', id: r.id },
      label: r.name,
      detail: label(regionCount(r.id)),
      icon: 'map-outline',
    }));
    const cityOption = (c: (typeof CITIES)[number]): Option<Place | null> => ({ value: { kind: 'city', id: c.id }, label: c.name, detail: label(countOf.get(c.id)) });
    const popular = CITIES.filter((c) => c.popular && matches(c.name, c.aliases)).map(cityOption);
    const others = CITIES.filter((c) => !c.popular && matches(c.name, c.aliases))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(cityOption);

    return [
      { options: [...top, ...regions] },
      { header: q ? undefined : 'Popular Cities', options: popular },
      { header: q ? undefined : 'More Cities', options: others },
    ].filter((g) => g.options.length > 0);
  }, [query, countOf, allowAny]);

  const select = (place: Place | null) => {
    onChange(place);
    setQuery('');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Location" scroll>
      <View style={styles.search}>
        <SearchField value={query} onChangeText={setQuery} onClear={() => setQuery('')} placeholder="Search cities" />
      </View>
      <OptionList groups={groups} selected={value} onSelect={select} isEqual={samePlace} />
    </Sheet>
  );
}

const styles = StyleSheet.create({ search: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg } });
