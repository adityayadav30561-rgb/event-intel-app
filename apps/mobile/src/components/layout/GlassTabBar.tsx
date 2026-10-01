import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, Text } from '@/components/ui';
import { radius, shadow, spacing, TAB_BAR_HEIGHT, useTheme } from '@/theme';

type Icon = keyof typeof Ionicons.glyphMap;

export const TAB_ICONS: Record<string, [Icon, Icon]> = {
  index: ['home', 'home-outline'],
  explore: ['compass', 'compass-outline'],
  'my-events': ['bookmark', 'bookmark-outline'],
  calendar: ['calendar', 'calendar-outline'],
  more: ['ellipsis-horizontal-circle', 'ellipsis-horizontal-circle-outline'],
};

/**
 * Floating glass tab bar in the style of Apple's current design: a capsule that hovers above
 * the content, with a soft highlight behind the selected tab.
 */
export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ pointerEvents: 'box-none' }, styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <Glass strength="thick" style={[styles.bar, shadow.floating]} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const options = descriptors[route.key]?.options;
          const label = typeof options?.title === 'string' ? options.title : route.name;
          const [on, off] = TAB_ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          const color = focused ? colors.tint : colors.label;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              style={styles.item}
            >
              <View style={[styles.lens, focused && { backgroundColor: colors.tertiaryFill }]}>
                <Ionicons name={focused ? on : off} size={23} color={color} />
                <Text variant="caption2Strong" style={{ color }} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: spacing.lg },
  bar: { flexDirection: 'row', height: TAB_BAR_HEIGHT, borderRadius: radius.pill, padding: 4, width: '100%', maxWidth: 480 },
  item: { flex: 1 },
  lens: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: radius.pill },
});
