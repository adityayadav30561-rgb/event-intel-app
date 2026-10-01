import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import Stack from 'expo-router/js-stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OfflineBanner, ToastHost } from '@/components/ui';
import { InstallPrompt } from '@/components/ui/InstallPrompt';
import { registerServiceWorker } from '@/platform/serviceWorker';
import { useMeSync } from '@/hooks/useAccount';
import { useTrackingLifecycle } from '@/hooks/useTracking';
import { AppProviders } from '@/providers/AppProviders';
import { useCurrentUser, useSessionStage } from '@/store/sessionStore';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
registerServiceWorker();

/**
 * Where you can go depends on the session (Phase 4): signed out → sign in; temporary password →
 * choose your own; first run → onboarding; then the app. Every app route is listed under the
 * last guard, so none of them can be opened without signing in. (The router reads these
 * Screen and Protected elements directly, so they must be the Stack's own children.)
 */
function RootStack() {
  const { colors } = useTheme();
  const stage = useSessionStage();
  const isAdmin = useCurrentUser()?.role === 'admin';
  useMeSync();
  useTrackingLifecycle();
  const quiet = { animation: 'fade', gestureEnabled: false } as const;
  return (
    <Stack
      screenOptions={{
        // The stack turns transitions off on the web by default ("browser-like");
        // this is an app, so use the iOS push: slide in from the right with parallax.
        // (Named animations only: an explicit interpolator here would override each screen's own.)
        animation: 'slide_from_right',
        headerShown: false,
        gestureEnabled: true,
        // On the web the stack lets cards grow with their content (document scrolling);
        // pin them to the screen so each screen's own scroll view scrolls.
        cardStyle: { flex: 1, backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={stage === 'signed_out'}>
        <Stack.Screen name="sign-in" options={quiet} />
      </Stack.Protected>
      <Stack.Protected guard={stage === 'set_password'}>
        <Stack.Screen name="set-password" options={quiet} />
      </Stack.Protected>
      <Stack.Protected guard={stage === 'onboarding'}>
        <Stack.Screen name="onboarding" options={quiet} />
      </Stack.Protected>
      <Stack.Protected guard={stage === 'ready'}>
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="event/[id]/index" />
        <Stack.Screen name="event/[id]/agenda" />
        <Stack.Screen name="event/[id]/speakers" />
        <Stack.Screen name="event/[id]/exhibitors" />
        <Stack.Screen name="event/[id]/checklist" />
        <Stack.Screen name="event/[id]/note" />
        <Stack.Screen name="organizer/[id]" />
        <Stack.Screen name="category/[id]" />
        <Stack.Screen name="browse/[section]" />
        <Stack.Screen name="about" />
        <Stack.Screen name="settings/interests" />
        <Stack.Screen name="settings/password" />
        <Stack.Screen name="settings/offline" />
        <Stack.Protected guard={isAdmin}>
          <Stack.Screen name="settings/team" />
        </Stack.Protected>
        <Stack.Screen name="+not-found" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const { colors, scheme } = useTheme();
  // Text uses the system font; only the icon font needs loading.
  const [loaded, error] = useFonts(Ionicons.font);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <AppProviders>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <RootStack />
          <OfflineBanner />
          <InstallPrompt />
          <ToastHost />
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
