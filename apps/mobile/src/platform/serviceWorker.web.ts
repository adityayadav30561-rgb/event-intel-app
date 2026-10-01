/**
 * Registers public/sw.js. Needed for offline use (Phase 5) and push notifications (Phase 7).
 * Skipped during local development so Metro's live reload isn't served stale files.
 */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!process.env.EXPO_PUBLIC_BUILD_TIME) return;
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('Service worker registration failed', error);
    });
  };
  // The bundle often runs after the page's load event has already fired.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
