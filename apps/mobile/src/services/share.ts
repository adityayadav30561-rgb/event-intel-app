import { formatDateRange, type EventSummary } from '@eii/shared';
import { Platform, Share } from 'react-native';
import { showToast } from '@/components/ui';

/** Public event details only — notes and tracking status are never shared (spec §94). */
export function shareText(event: EventSummary & { officialWebsite?: string }): string {
  const when = formatDateRange(new Date(event.startAt), new Date(event.endAt));
  const where = event.attendanceMode === 'online' ? 'Online' : [event.venueName, event.city].filter(Boolean).join(', ');
  return [event.title, when, where, event.officialWebsite].filter(Boolean).join('\n');
}

export async function shareEvent(event: EventSummary & { officialWebsite?: string }) {
  const text = shareText(event);
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: event.title, text, url: event.officialWebsite });
        return;
      }
      await navigator.clipboard.writeText(text);
      showToast('Event details copied', 'copy');
      return;
    }
    await Share.share({ title: event.title, message: text });
  } catch (error) {
    // Dismissing the share sheet is not an error.
    if (error instanceof Error && error.name === 'AbortError') return;
    showToast("Couldn't share this event", 'alert-circle');
  }
}

/** Any short message through the share sheet (or copied, where sharing isn't available). */
export async function shareMessage(title: string, text: string, copiedLabel = 'Copied') {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      showToast(copiedLabel, 'copy');
      return;
    }
    await Share.share({ title, message: text });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return;
    showToast("Couldn't share", 'alert-circle');
  }
}

/**
 * Saves a file from the web app: the share sheet where it can take files (on iPhone, "Save to
 * Files"), otherwise a normal download.
 */
export async function saveFile(name: string, contents: string, type = 'application/json'): Promise<'saved' | 'cancelled' | 'unsupported'> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return 'unsupported';
  const blob = new Blob([contents], { type });
  const file = typeof File !== 'undefined' ? new File([blob], name, { type }) : undefined;
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'saved';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
      // NotAllowedError: the tap was too long ago for the share sheet; download instead.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'saved';
}
