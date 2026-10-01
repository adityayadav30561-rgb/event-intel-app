import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadow, spacing, TAB_BAR_HEIGHT, useTheme } from '@/theme';
import { Button } from './Button';
import { Glass } from './Glass';
import { Sheet } from './Sheet';
import { Text } from './Text';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'eii.install.dismissedAt';
const SNOOZE_DAYS = 3;

export const isInstalledWebApp = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
const isIOS = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
const recentlyDismissed = () => {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < SNOOZE_DAYS * 86_400_000;
  } catch {
    return false;
  }
};

/** Step-by-step "Add to Home Screen" instructions (Safari has no install button of its own). */
export function InstallGuideSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const ios = isIOS();
  return (
    <Sheet visible={visible} onClose={onClose} title="Add to Home Screen">
      <View style={styles.steps}>
        <Step n={1} icon="share-outline" text={ios ? 'Tap the Share button in Safari.' : 'Open the browser menu (⋮).'} />
        <Step n={2} icon="add-circle-outline" text={ios ? 'Choose Add to Home Screen.' : 'Choose Install app or Add to Home screen.'} />
        <Step n={3} icon="apps-outline" text="Open Event Intel from your Home Screen from now on." />
      </View>
    </Sheet>
  );
}

function Step({ n, icon, text }: { n: number; icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.step}>
      <View style={[styles.stepIcon, { backgroundColor: colors.tintSoft }]}>
        <Ionicons name={icon} size={22} color={colors.tint} />
      </View>
      <Text variant="body" style={styles.stepText}>
        <Text variant="headline">{n}. </Text>
        {text}
      </Text>
    </View>
  );
}

/**
 * Banner offering to add the app to the Home Screen. Android Chrome gets the browser's own
 * install prompt; iPhone gets the guide. Hidden once installed or recently dismissed.
 */
export function InstallPrompt() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [guide, setGuide] = useState(false);
  const [ios] = useState(isIOS);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const [y] = useState(() => new Animated.Value(220));

  useEffect(() => {
    if (isInstalledWebApp() || recentlyDismissed()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const show = () => {
      setVisible(true);
      Animated.spring(y, { toValue: 0, useNativeDriver: false, damping: 20, stiffness: 200 }).start();
    };
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      if (timer) clearTimeout(timer);
      timer = setTimeout(show, 2500);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    if (ios) timer = setTimeout(show, 3000);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      if (timer) clearTimeout(timer);
    };
  }, [y, ios]);

  const hide = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage unavailable */
    }
    Animated.timing(y, { toValue: 220, duration: 220, useNativeDriver: false }).start(() => setVisible(false));
  };

  const install = async () => {
    if (ios || !deferred.current) {
      setGuide(true);
      return;
    }
    await deferred.current.prompt();
    deferred.current = null;
    hide();
  };

  return (
    <>
      {visible ? (
        <Animated.View style={[styles.wrap, { bottom: TAB_BAR_HEIGHT + Math.max(insets.bottom, spacing.sm) + spacing.md, transform: [{ translateY: y }] }]} accessibilityRole="alert">
          <Glass strength="thick" style={[styles.banner, shadow.floating]}>
            <Image source={require('../../../assets/images/icon.png')} style={styles.icon} accessibilityLabel="Event Intel" />
            <View style={styles.text}>
              <Text variant="subheadlineStrong" numberOfLines={1}>
                Get the App
              </Text>
              <Text variant="footnote" tone="secondary" numberOfLines={2}>
                Add Event Intel to your Home Screen.
              </Text>
            </View>
            <Button title="Add" size="small" onPress={install} />
            <Pressable onPress={hide} hitSlop={10} accessibilityRole="button" accessibilityLabel="Not now" style={styles.close}>
              <Ionicons name="close" size={18} color={colors.secondaryLabel} />
            </Pressable>
          </Glass>
        </Animated.View>
      ) : null}
      <InstallGuideSheet
        visible={guide}
        onClose={() => {
          setGuide(false);
          hide();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center', zIndex: 900 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingRight: spacing.sm, borderRadius: radius.xl, width: '100%', maxWidth: 520 },
  icon: { width: 44, height: 44, borderRadius: 10 },
  text: { flex: 1, minWidth: 0 },
  close: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  steps: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, paddingTop: spacing.sm, gap: spacing.lg },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepIcon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1 },
});
