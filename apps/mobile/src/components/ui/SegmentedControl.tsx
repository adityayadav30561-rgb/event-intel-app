import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { radius, shadow, useTheme } from '@/theme';
import { Text } from './Text';

type Props<T extends string> = {
  segments: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

const PAD = 2;

/** iOS segmented control: a raised thumb that springs to the selected segment. */
export function SegmentedControl<T extends string>({ segments, value, onChange }: Props<T>) {
  const { colors, scheme } = useTheme();
  const [width, setWidth] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  // Whether the thumb has been placed once (no animation on first layout).
  const placed = useRef(false);
  const index = Math.max(0, segments.findIndex((s) => s.value === value));
  const segmentWidth = width > 0 ? (width - PAD * 2) / segments.length : 0;

  useEffect(() => {
    if (!segmentWidth) return;
    const to = index * segmentWidth;
    if (!placed.current) {
      x.setValue(to);
      placed.current = true;
    } else {
      Animated.spring(x, { toValue: to, useNativeDriver: Platform.OS !== 'web', stiffness: 420, damping: 32, mass: 0.9 }).start();
    }
  }, [index, segmentWidth, x]);

  return (
    <View
      style={[styles.track, { backgroundColor: colors.tertiaryFill }]}
      accessibilityRole="tablist"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            styles.thumb,
            shadow.card,
            { width: segmentWidth, backgroundColor: scheme === 'dark' ? '#636366' : '#FFFFFF', transform: [{ translateX: x }] },
          ]}
        />
      ) : null}
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            onPress={() => onChange(segment.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.segment, pressed && !active && { opacity: 0.6 }]}
          >
            <Text variant={active ? 'footnoteStrong' : 'footnote'} numberOfLines={1}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: PAD, borderRadius: radius.sm, height: 34 },
  thumb: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: radius.sm - 2 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
