import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Glass, Text } from '@/components/ui';
import { shadow, spacing, TAB_BAR_HEIGHT, useTheme } from '@/theme';

type Icon = keyof typeof Ionicons.glyphMap;

export const TAB_ICONS: Record<string, [Icon, Icon]> = {
  index: ['home', 'home-outline'],
  explore: ['compass', 'compass-outline'],
  'my-events': ['bookmark', 'bookmark-outline'],
  calendar: ['calendar', 'calendar-outline'],
  more: ['ellipsis-horizontal-circle', 'ellipsis-horizontal-circle-outline'],
};

const PAD = 4;
const LENS_HEIGHT = TAB_BAR_HEIGHT - PAD * 2;
// Width animates, so the native driver can't be used for the lens.
const useNativeDriver = false;

/** Leading edge: quick and firm. Trailing edge: softer, so the lens stretches in motion and settles like liquid. */
const LEAD = { stiffness: 420, damping: 30, mass: 0.9 };
const TRAIL = { stiffness: 190, damping: 22, mass: 1 };

/**
 * Floating Liquid Glass tab bar (Apple's current design): a translucent capsule with a glass lens
 * behind the selected tab. The lens glides to whatever you touch, stretches while it moves, swells
 * while pressed, and can be dragged across the bar to scrub between tabs.
 */
export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const count = state.routes.length;
  const [barWidth, setBarWidth] = useState(0);
  const slot = barWidth > 0 ? (barWidth - PAD * 2) / count : 0;

  const [left] = useState(() => new Animated.Value(PAD));
  const [right] = useState(() => new Animated.Value(PAD));
  const [swell] = useState(() => new Animated.Value(1));
  const lensIndex = useRef(state.index);
  const placed = useRef(false);
  const barRef = useRef<View>(null);
  const [barX, setBarX] = useState(0);

  /** Glide the lens to a tab: the edge in the direction of travel leads, the other follows. */
  const glideTo = useCallback(
    (index: number, forward: boolean) => {
      if (!slot) return;
      Animated.parallel([
        Animated.spring(left, { toValue: PAD + index * slot, useNativeDriver, ...(forward ? TRAIL : LEAD) }),
        Animated.spring(right, { toValue: PAD + (index + 1) * slot, useNativeDriver, ...(forward ? LEAD : TRAIL) }),
      ]).start();
    },
    [slot, left, right],
  );

  const setSwell = useCallback(
    (pressed: boolean) =>
      Animated.spring(swell, {
        toValue: pressed ? 1.08 : 1,
        useNativeDriver,
        stiffness: 380,
        damping: pressed ? 18 : 14,
      }).start(),
    [swell],
  );

  // Place the lens without animating on first layout, then follow the active tab.
  useEffect(() => {
    if (!slot) return;
    if (!placed.current) {
      left.setValue(PAD + state.index * slot);
      right.setValue(PAD + (state.index + 1) * slot);
      lensIndex.current = state.index;
      placed.current = true;
    } else glideTo(state.index, state.index >= lensIndex.current);
    lensIndex.current = state.index;
  }, [state.index, slot, glideTo, left, right]);

  const navigateTo = useCallback(
    (index: number) => {
      const route = state.routes[index];
      if (!route) return;
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (state.index !== index && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    },
    [state, navigation],
  );

  // Drag across the bar to scrub: the lens follows the finger and snaps to the tab you let go on.
  // Positions use page coordinates against the bar's own position (measured on layout).
  const pan = useMemo(() => {
    const toBarX = (pageX: number) => pageX - barX;
    const indexAt = (x: number) => Math.max(0, Math.min(count - 1, Math.floor((x - PAD) / (slot || 1))));
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => setSwell(true),
      onPanResponderMove: (_e, g) => {
        const half = slot / 2;
        const center = Math.max(PAD + half, Math.min(barWidth - PAD - half, toBarX(g.moveX)));
        left.setValue(center - half);
        right.setValue(center + half);
      },
      onPanResponderRelease: (_e, g) => {
        setSwell(false);
        const target = indexAt(toBarX(g.moveX));
        glideTo(target, target >= state.index);
        navigateTo(target);
      },
      onPanResponderTerminate: () => {
        setSwell(false);
        glideTo(state.index, true);
      },
    });
  }, [slot, barWidth, barX, count, setSwell, glideTo, navigateTo, state.index, left, right]);

  const onLayout = (e: LayoutChangeEvent) => {
    setBarWidth(e.nativeEvent.layout.width);
    barRef.current?.measureInWindow((x) => setBarX(x));
  };
  const lensWidth = Animated.subtract(right, left);

  return (
    <View style={[{ pointerEvents: 'box-none' }, styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <View ref={barRef} style={styles.barHolder} onLayout={onLayout} {...pan.panHandlers}>
        <Glass strength="thick" style={[styles.bar, shadow.floating]} accessibilityRole="tablist">
          {slot > 0 ? (
            <Animated.View
              style={[
                { pointerEvents: 'none' },
                styles.lens,
                lensMaterial(scheme === 'dark'),
                { left, width: lensWidth, transform: [{ scale: swell }] },
              ]}
            >
              <LensRim dark={scheme === 'dark'} />
            </Animated.View>
          ) : null}
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const options = descriptors[route.key]?.options;
            const label = typeof options?.title === 'string' ? options.title : route.name;
            const [on, off] = TAB_ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
            return (
              <Pressable
                key={route.key}
                onPressIn={() => {
                  glideTo(index, index >= state.index);
                  setSwell(true);
                }}
                onPressOut={() => setSwell(false)}
                onPress={() => navigateTo(index)}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
                style={styles.item}
              >
                <TabIcon
                  focused={focused}
                  on={on}
                  off={off}
                  label={label}
                  color={focused ? colors.tint : colors.label}
                />
              </Pressable>
            );
          })}
        </Glass>
      </View>
    </View>
  );
}

/** Icon and label; the icon gives a small spring "pop" when its tab becomes selected. */
function TabIcon({
  focused,
  on,
  off,
  label,
  color,
}: {
  focused: boolean;
  on: Icon;
  off: Icon;
  label: string;
  color: string;
}) {
  const [pop] = useState(() => new Animated.Value(1));
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (focused && !wasFocused.current) {
      pop.setValue(0.82);
      Animated.spring(pop, {
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
        stiffness: 520,
        damping: 13,
        mass: 0.7,
      }).start();
    }
    wasFocused.current = focused;
  }, [focused, pop]);
  return (
    <View style={styles.itemInner}>
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <Ionicons name={focused ? on : off} size={23} color={color} />
      </Animated.View>
      <Text variant="caption2Strong" style={{ color }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Glass lens material: brighter, more saturated glass with an inner highlight and soft lift. */
function lensMaterial(dark: boolean): ViewStyle {
  if (Platform.OS !== 'web') return { backgroundColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.55)' };
  return {
    // Light: a soft grey capsule (as on iOS); dark: brighter glass. Both lift the content behind them.
    backgroundColor: dark ? 'rgba(255,255,255,0.16)' : 'rgba(118,118,128,0.16)',
    backdropFilter: 'blur(4px) saturate(240%) brightness(1.08)',
    WebkitBackdropFilter: 'blur(4px) saturate(240%) brightness(1.08)',
    boxShadow: dark
      ? 'inset 0 1px 1px rgba(255,255,255,0.35), inset 0 -1px 1px rgba(255,255,255,0.08), 0 4px 14px rgba(0,0,0,0.35)'
      : 'inset 0 1px 1.5px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(255,255,255,0.5), 0 3px 10px rgba(0,0,0,0.08)',
  } as ViewStyle;
}

/** Thin rim with a faint spectral edge, like light refracting through a glass lens. */
function LensRim({ dark }: { dark: boolean }) {
  const r = LENS_HEIGHT / 2;
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="lensRim" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#7FE7FF" stopOpacity={dark ? 0.55 : 0.75} />
          <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity={dark ? 0.35 : 0.9} />
          <Stop offset="0.55" stopColor="#FF8AD8" stopOpacity={dark ? 0.4 : 0.55} />
          <Stop offset="0.8" stopColor="#FFE38A" stopOpacity={dark ? 0.35 : 0.55} />
          <Stop offset="1" stopColor="#8AB4FF" stopOpacity={dark ? 0.5 : 0.7} />
        </LinearGradient>
      </Defs>
      <Rect
        x="0.75"
        y="0.75"
        width="99%"
        height={LENS_HEIGHT - 1.5}
        rx={r - 0.75}
        ry={r - 0.75}
        fill="none"
        stroke="url(#lensRim)"
        strokeWidth={1.25}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: spacing.lg },
  barHolder: { width: '100%', maxWidth: 480 },
  bar: { flexDirection: 'row', height: TAB_BAR_HEIGHT, borderRadius: 999, padding: PAD },
  lens: { position: 'absolute', top: PAD, height: LENS_HEIGHT, borderRadius: 999, overflow: 'hidden' },
  item: { flex: 1 },
  itemInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 },
});
