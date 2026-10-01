/**
 * Your current position, asked for only when you tap "Near Me" (§85–86). One reading, no
 * tracking; nothing is stored or sent anywhere except as the search's centre point.
 */
export class LocationError extends Error {}

export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new LocationError('This browser can’t share your location. Choose a city instead.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject(
          new LocationError(
            err.code === err.PERMISSION_DENIED
              ? 'Location is off for this app. Allow it in Settings → Safari → Location, or choose a city.'
              : 'Couldn’t find your location. Try again, or choose a city.',
          ),
        ),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  });
}
