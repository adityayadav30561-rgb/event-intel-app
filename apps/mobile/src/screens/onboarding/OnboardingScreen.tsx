import { EMPTY_PREFERENCES, type Preferences } from '@eii/shared';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InterestSection } from '@/components/account/InterestPicker';
import { Button, showToast, Text } from '@/components/ui';
import { useCompleteOnboarding, usePreferences, useSavePreferences } from '@/hooks/useAccount';
import { usePush } from '@/hooks/useAlerts';
import type { PushStatus } from '@/platform/push';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme, type ColorTokens } from '@/theme';

type Intro = { icon: keyof typeof Ionicons.glyphMap; color: (c: ColorTokens) => string; title: string; body: string };

// Spec §8 onboarding: three short pages, then interests and cities. No location permission here.
const INTROS: Intro[] = [
  {
    icon: 'compass',
    color: (c) => c.blue,
    title: 'Discover events across India',
    body: 'Conferences, expos and summits from organisers, venues and industry bodies, kept up to date in one place.',
  },
  {
    icon: 'bookmark',
    color: (c) => c.orange,
    title: 'Track the events that matter to you',
    body: 'See why an event fits what you follow, then save it and plan your visit.',
  },
  {
    icon: 'notifications',
    color: (c) => c.red,
    title: 'Never miss an important conference, expo or summit',
    body: 'Dates, venues and status are checked twice a day, and changes are flagged.',
  },
];

/** Intros, interests, cities, alerts. */
const PAGES = INTROS.length + 3;
const ALERTS_PAGE = INTROS.length + 2;

const ALERT_HINT: Partial<Record<PushStatus, string>> = {
  on: 'Alerts are on for this phone.',
  denied: 'Alerts are blocked. You can allow them later in iPhone Settings → Notifications → Event Intel.',
  needs_install: 'iPhone sends alerts only to apps opened from the Home Screen. Add Event Intel there (Share → Add to Home Screen), then turn alerts on in More → Notifications.',
  unsupported: 'This browser can’t show alerts. Everything still appears in the inbox.',
  unavailable: 'Turn alerts on later from More → Notifications in the installed app.',
};

/** First run, shown once (and skippable): what the app does, then what you're interested in. */
export function OnboardingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const saved = usePreferences().data;
  const save = useSavePreferences();
  const complete = useCompleteOnboarding();
  const [page, setPage] = useState(0);
  const push = usePush();
  const [draft, setDraft] = useState<Preferences | null>(null);
  const prefs = draft ?? saved ?? EMPTY_PREFERENCES;

  // Each page slides in from the side it comes from, like a paged iOS sheet.
  const [enter] = useState(() => new Animated.Value(1));
  const [direction, setDirection] = useState(1);
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 320, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [page, enter]);

  const go = (to: number) => {
    setDirection(to > page ? 1 : -1);
    setPage(to);
  };

  const finish = async () => {
    try {
      if (draft) await save.mutateAsync(draft);
      await complete.mutateAsync();
    } catch (error) {
      showToast(errorMessage(error), 'alert-circle');
    }
  };

  const busy = save.isPending || complete.isPending;
  const last = page === PAGES - 1;
  const intro = INTROS[page];
  const chosen = prefs.technologyIds.length + prefs.categoryIds.length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
      <View style={styles.topBar}>
        {page > 0 ? (
          <Pressable onPress={() => go(page - 1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.topButton}>
            <Ionicons name="chevron-back" size={24} color={colors.tint} />
          </Pressable>
        ) : (
          <View style={styles.topButton} />
        )}
        <Pressable onPress={finish} disabled={busy} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip">
          <Text variant="body" tone="tint">
            Skip
          </Text>
        </Pressable>
      </View>

      <Animated.View
        style={[
          styles.page,
          {
            opacity: enter,
            transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [direction * 36, 0] }) }],
          },
        ]}
      >
        {page === ALERTS_PAGE ? (
          <View style={styles.intro}>
            <View style={[styles.iconWrap, { backgroundColor: colors.red }]}>
              <Ionicons name="notifications" size={52} color="#FFFFFF" />
            </View>
            <Text variant="largeTitle" style={styles.center} accessibilityRole="header">
              Turn on alerts
            </Text>
            <Text variant="body" tone="secondary" style={[styles.center, styles.introBody]}>
              Hear when an event you follow changes date, venue or status, when a saved search finds something new, and before events you plan to visit.
            </Text>
            {push.status === 'off' ? (
              <Button title={push.busy ? 'Turning On…' : 'Turn On Alerts'} icon="notifications" variant="tinted" onPress={() => void push.turnOn().catch(() => undefined)} disabled={push.busy} />
            ) : push.status ? (
              <Text variant="subheadline" tone={push.status === 'on' ? 'green' : 'secondary'} style={[styles.center, styles.introBody]}>
                {ALERT_HINT[push.status]}
              </Text>
            ) : null}
          </View>
        ) : intro ? (
          <View style={styles.intro}>
            <View style={[styles.iconWrap, { backgroundColor: intro.color(colors) }]}>
              <Ionicons name={intro.icon} size={52} color="#FFFFFF" />
            </View>
            <Text variant="largeTitle" style={styles.center} accessibilityRole="header">
              {intro.title}
            </Text>
            <Text variant="body" tone="secondary" style={[styles.center, styles.introBody]}>
              {intro.body}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.pickScroll} showsVerticalScrollIndicator={false}>
            <Text variant="largeTitle" accessibilityRole="header">
              {page === INTROS.length ? 'What are you interested in?' : 'Where do you go for events?'}
            </Text>
            <Text variant="body" tone="secondary">
              {page === INTROS.length
                ? 'Events that match rise to the top, with the reasons shown. Change this any time in More.'
                : 'Optional. Events in these cities, and nearby ones, rank higher.'}
            </Text>
            {page === INTROS.length ? (
              <>
                <InterestSection field="technologyIds" prefs={prefs} onChange={setDraft} />
                <InterestSection field="categoryIds" prefs={prefs} onChange={setDraft} />
              </>
            ) : (
              <InterestSection field="cityIds" prefs={prefs} onChange={setDraft} showTitle={false} />
            )}
          </ScrollView>
        )}
      </Animated.View>

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${PAGES}`}>
          {Array.from({ length: PAGES }, (_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === page ? colors.label : colors.quaternaryLabel }, i === page && styles.dotActive]} />
          ))}
        </View>
        <Button
          title={busy ? 'Saving…' : last ? 'Get Started' : page === INTROS.length && chosen === 0 ? 'Not Now' : 'Continue'}
          size="large"
          block
          disabled={busy}
          onPress={() => (last ? void finish() : go(page + 1))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  topButton: { width: 32 },
  page: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  intro: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xxl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  iconWrap: { width: 104, height: 104, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  center: { textAlign: 'center' },
  introBody: { maxWidth: 420 },
  pickScroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.xl },
  footer: { paddingHorizontal: spacing.lg, gap: spacing.lg, width: '100%', maxWidth: 560, alignSelf: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: radius.pill },
  dotActive: { width: 20 },
});
