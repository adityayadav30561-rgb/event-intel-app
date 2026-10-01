import { Tabs } from 'expo-router/js-tabs';
import { Easing, type Animated } from 'react-native';
import { GlassTabBar } from '@/components/layout/GlassTabBar';
import { useTheme } from '@/theme';

/**
 * Tab switch as on iOS: the new tab fades in with a slight lift in scale while the old one
 * fades back, shifted a few points toward where it sits in the bar.
 */
function forTabSwitch({ current }: { current: { progress: Animated.Value } }) {
  return {
    sceneStyle: {
      opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
      transform: [
        { translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-18, 0, 18] }) },
        { scale: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.985, 1, 0.985] }) },
      ],
    },
  };
}

/** Five primary destinations (spec §8) in a floating Liquid Glass tab bar. */
export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        animation: 'fade',
        sceneStyleInterpolator: forTabSwitch,
        transitionSpec: { animation: 'timing', config: { duration: 260, easing: Easing.bezier(0.22, 1, 0.36, 1) } },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
      <Tabs.Screen name="my-events" options={{ title: 'My Events' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
