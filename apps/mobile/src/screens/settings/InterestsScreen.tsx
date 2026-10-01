import { EMPTY_PREFERENCES, type Preferences } from '@eii/shared';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { InterestSection } from '@/components/account/InterestPicker';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { ErrorState, Skeleton, Text } from '@/components/ui';
import { usePreferences, useSavePreferences } from '@/hooks/useAccount';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { spacing } from '@/theme';

/** More → Interests: what Home, badges and "Why this event matches you" are based on. */
export function InterestsScreen() {
  const query = usePreferences();
  const save = useSavePreferences();
  const [draft, setDraft] = useState<Preferences | null>(null);
  const prefs = draft ?? query.data ?? EMPTY_PREFERENCES;

  // Taps apply at once on screen; the server copy is written when the tapping stops.
  const settled = useDebouncedValue(draft, 600);
  const lastSaved = useRef<Preferences | null>(null);
  const { mutate } = save;
  useEffect(() => {
    if (!settled || settled === lastSaved.current) return;
    lastSaved.current = settled;
    mutate(settled);
  }, [settled, mutate]);

  return (
    <LargeTitleScrollView title="Interests" back>
      <View style={styles.body}>
        <Text variant="body" tone="secondary" style={styles.intro}>
          Events that match what you choose rank higher and show a match badge with the reasons.
        </Text>
        {query.isPending && !query.data ? (
          <View style={styles.skeleton}>
            <Skeleton width="40%" height={20} />
            <Skeleton height={120} />
          </View>
        ) : query.isError && !query.data ? (
          <ErrorState message="Your interests couldn’t be loaded." onRetry={() => query.refetch()} />
        ) : (
          <>
            <InterestSection field="technologyIds" prefs={prefs} onChange={setDraft} />
            <InterestSection field="categoryIds" prefs={prefs} onChange={setDraft} />
            <InterestSection field="industryIds" prefs={prefs} onChange={setDraft} footer="Who the event is for: an automotive audience, say." />
            <InterestSection field="cityIds" prefs={prefs} onChange={setDraft} footer="Nearby cities count too: New Delhi includes Noida and Gurugram." />
            <InterestSection field="eventTypes" prefs={prefs} onChange={setDraft} />
          </>
        )}
        {save.isError ? (
          <Text variant="footnote" tone="red" style={styles.intro}>
            Couldn’t save your last change. It will be tried again when you change something.
          </Text>
        ) : null}
      </View>
    </LargeTitleScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.xxl },
  intro: { paddingHorizontal: spacing.xs },
  skeleton: { gap: spacing.md },
});
