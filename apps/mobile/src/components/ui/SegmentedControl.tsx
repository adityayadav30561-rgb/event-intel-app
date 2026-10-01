import { Pressable, StyleSheet, View } from 'react-native';
import { radius, shadow, useTheme } from '@/theme';
import { Text } from './Text';

type Props<T extends string> = {
  segments: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** iOS segmented control. */
export function SegmentedControl<T extends string>({ segments, value, onChange }: Props<T>) {
  const { colors, scheme } = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: colors.tertiaryFill }]} accessibilityRole="tablist">
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            onPress={() => onChange(segment.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[
              styles.segment,
              active && [styles.active, shadow.card, { backgroundColor: scheme === 'dark' ? '#636366' : '#FFFFFF' }],
            ]}
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
  track: { flexDirection: 'row', padding: 2, borderRadius: radius.sm, height: 34 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm - 2, paddingHorizontal: 6 },
  active: {},
});
