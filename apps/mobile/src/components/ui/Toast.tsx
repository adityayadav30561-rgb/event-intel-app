import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { shadow, spacing, useTheme } from '@/theme';
import { Glass } from './Glass';
import { Text } from './Text';

type ToastState = {
  message: string | null;
  icon: keyof typeof Ionicons.glyphMap;
  id: number;
  show: (message: string, icon?: keyof typeof Ionicons.glyphMap) => void;
};

export const useToast = create<ToastState>((set) => ({
  message: null,
  icon: 'checkmark-circle',
  id: 0,
  show: (message, icon = 'checkmark-circle') => set((s) => ({ message, icon, id: s.id + 1 })),
}));

/** Shorthand for non-React callers. */
export const showToast = (message: string, icon?: keyof typeof Ionicons.glyphMap) => useToast.getState().show(message, icon);

const useNativeDriver = Platform.OS !== 'web';

/** Small glass capsule that drops in from the top, like iOS system notices. */
export function ToastHost() {
  const { message, icon, id } = useToast();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [y] = useState(() => new Animated.Value(-120));

  useEffect(() => {
    if (!message) return;
    Animated.spring(y, { toValue: 0, useNativeDriver, damping: 18, stiffness: 220 }).start();
    const timer = setTimeout(() => Animated.timing(y, { toValue: -120, duration: 220, useNativeDriver }).start(), 2200);
    return () => clearTimeout(timer);
  }, [id, message, y]);

  if (!message) return null;
  return (
    <Animated.View style={[{ pointerEvents: 'none' }, styles.wrap, { top: insets.top + spacing.sm, transform: [{ translateY: y }] }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Glass strength="thick" style={[styles.toast, shadow.floating]}>
        <Ionicons name={icon} size={18} color={colors.label} />
        <Text variant="subheadlineStrong" numberOfLines={2}>
          {message}
        </Text>
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 12, borderRadius: 999, maxWidth: 360 },
});
