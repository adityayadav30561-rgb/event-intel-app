import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import Stack, { TransitionPresets } from 'expo-router/js-stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OfflineBanner, ToastHost } from '@/components/ui';
import { InstallPrompt } from '@/components/ui/InstallPrompt';
import { registerServiceWorker } from '@/platform/serviceWorker';
import { AppProviders } from '@/providers/AppProviders';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
registerServiceWorker();

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
          <Stack
            screenOptions={{
              ...TransitionPresets.SlideFromRightIOS,
              // The stack turns transitions off on the web by default ("browser-like");
              // this is an app, so use the iOS push: slide in from the right with parallax.
              animation: 'slide_from_right',
              headerShown: false,
              gestureEnabled: true,
              // On the web the stack lets cards grow with their content (document scrolling);
              // pin them to the screen so each screen's own scroll view scrolls.
              cardStyle: { flex: 1, backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="(tabs)" />
          </Stack>
          <OfflineBanner />
          <InstallPrompt />
          <ToastHost />
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
