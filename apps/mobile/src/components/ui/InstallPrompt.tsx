/** Native builds are already installed apps; the web variants live in InstallPrompt.web.tsx. */
export function InstallPrompt() {
  return null;
}

export function InstallGuideSheet(_props: { visible: boolean; onClose: () => void }) {
  return null;
}

export function isInstalledWebApp() {
  return true;
}
