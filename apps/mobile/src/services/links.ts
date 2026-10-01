import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';
import { showToast } from '@/components/ui';

/** Opens an external page (official site, registration) outside the app (spec §40). */
export async function openExternal(url: string) {
  try {
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  } catch {
    showToast("Couldn't open the link", 'alert-circle');
  }
}

const isApple = () =>
  Platform.OS === 'ios' || (Platform.OS === 'web' && typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent));

/** Directions to a venue in Apple Maps on iPhone, Google Maps elsewhere (spec §34). */
export function openDirections(place: { name?: string; address?: string; latitude?: number; longitude?: number }) {
  const query = encodeURIComponent(place.address ?? place.name ?? '');
  const coords = place.latitude !== undefined && place.longitude !== undefined ? `${place.latitude},${place.longitude}` : undefined;
  const url = isApple()
    ? `https://maps.apple.com/?${coords ? `daddr=${coords}&` : ''}q=${query}`
    : `https://www.google.com/maps/dir/?api=1&destination=${coords ?? query}`;
  Linking.openURL(url).catch(() => showToast("Couldn't open Maps", 'alert-circle'));
}
