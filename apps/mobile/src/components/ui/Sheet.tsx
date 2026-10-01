import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Right-hand header action; defaults to "Done". */
  actionLabel?: string;
  /** Left-hand header action, e.g. "Reset". */
  secondaryAction?: { label: string; onPress: () => void };
  children: ReactNode;
  /** Let the content scroll (long lists). */
  scroll?: boolean;
};

const useNativeDriver = Platform.OS !== 'web';

/** iOS page sheet: dimmed backdrop, grabber, header with Done, slides up with a spring. */
export function Sheet({ visible, onClose, title, actionLabel = 'Done', secondaryAction, children, scroll }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [translate] = useState(() => new Animated.Value(height));
  const [fade] = useState(() => new Animated.Value(0));

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translate, { toValue: 0, useNativeDriver, damping: 26, stiffness: 260, mass: 0.9 }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translate, { toValue: height, duration: 240, useNativeDriver }),
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver }),
      ]).start(({ finished }) => finished && setMounted(false));
    }
  }, [visible, mounted, translate, fade, height]);

  if (!mounted) return null;

  const Body = scroll ? ScrollView : View;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, maxHeight: height - insets.top - 24, paddingBottom: insets.bottom + spacing.sm, transform: [{ translateY: translate }] },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.fill }]} />
        <View style={styles.header}>
          <View style={styles.side}>
            {secondaryAction ? <Button title={secondaryAction.label} variant="plain" onPress={secondaryAction.onPress} /> : null}
          </View>
          <Text variant="headline" numberOfLines={1} style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <View style={[styles.side, styles.sideRight]}>
            <Button title={actionLabel} variant="plain" onPress={onClose} />
          </View>
        </View>
        <Body style={scroll ? styles.scroll : undefined} contentContainerStyle={scroll ? styles.scrollContent : undefined}>
          {children}
        </Body>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 6 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, height: 48 },
  side: { width: 88, alignItems: 'flex-start' },
  sideRight: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center' },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: spacing.lg },
});
