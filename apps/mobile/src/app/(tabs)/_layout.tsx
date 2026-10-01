import { Tabs } from 'expo-router/js-tabs';
import { GlassTabBar } from '@/components/layout/GlassTabBar';
import { useTheme } from '@/theme';

/** Five primary destinations (spec §8) in a floating glass tab bar. */
export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs tabBar={(props) => <GlassTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
      <Tabs.Screen name="my-events" options={{ title: 'My Events' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
