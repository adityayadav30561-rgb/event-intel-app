// Injects installable web app (home-screen) metadata into the exported HTML.
// Expo's "single" web output uses a fixed HTML template, so this runs after `expo export -p web`.
// Files in public/ (manifest.json, icons/, sw.js) are copied into dist/ by the export itself.
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('dist/index.html');
let html = fs.readFileSync(file, 'utf8');

// Content-Security-Policy (spec §125): scripts only from this site; data from the app's API and
// map tiles over HTTPS; images from any HTTPS host (event pictures come from organisers' sites).
// React Native Web sets inline styles, so styles allow 'unsafe-inline'; the map uses a blob worker.
// A build pointed at a local API (for testing) may also talk to it over plain http.
const api = process.env.EXPO_PUBLIC_API_URL ?? '';
const localApi = api.startsWith('http://') ? new URL(api).origin : '';
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https:${localApi ? ` ${localApi}` : ''}`,
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const head = `
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
    <meta name="description" content="Discover and track professional events across India: conferences, expos, summits and trade shows." />
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#F6F7F9" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0E1116" media="(prefers-color-scheme: dark)" />
    <meta name="application-name" content="Event Intelligence India" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Event Intel" />
    <meta name="format-detection" content="telephone=no" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
    <style>
      html,body{background:#F6F7F9;overscroll-behavior-y:none;-webkit-tap-highlight-color:transparent}
      @media (prefers-color-scheme: dark){html,body{background:#0E1116}}
    </style>
`;

// Replace the default viewport, then append the rest of the head block.
html = html.replace(/<meta name="viewport"[^>]*\/?>\s*/, '');
html = html.replace(/<title>[^<]*<\/title>/, '<title>Event Intelligence India</title>');
html = html.replace('</head>', `${head}</head>`);
fs.writeFileSync(file, html);
console.log('Injected home-screen metadata into dist/index.html');

// Offline app shell (Phase 5): list every built file in the service worker so the installed
// app opens with no network. Source maps and the worker itself are left out.
const dist = path.resolve('dist');
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
const files = walk(dist)
  .map((full) => `/${path.relative(dist, full).split(path.sep).join('/')}`)
  .filter((url) => url !== '/sw.js' && !url.endsWith('.map') && !url.endsWith('metadata.json'))
  // The icon package ships 19 fonts; the app uses only Ionicons (about 3 MB saved on each phone).
  .filter((url) => !url.includes('/vector-icons/') || url.includes('/Ionicons.'))
  // The map needs a connection for its tiles anyway; it loads when first opened.
  .filter((url) => !url.includes('/maplibre-gl'));
const precache = ['/', ...files].map((url) => encodeURI(url));
const bytes = walk(dist).filter((f) => files.includes(`/${path.relative(dist, f).split(path.sep).join('/')}`)).reduce((sum, f) => sum + fs.statSync(f).size, 0);
const version = process.env.EXPO_PUBLIC_BUILD_TIME || String(Date.now());
const swFile = path.join(dist, 'sw.js');
const template = fs.readFileSync(swFile, 'utf8');
// A worker without the placeholders means this dist was already processed (or the export failed).
if (!template.includes("'__VERSION__'") || !template.includes('const PRECACHE = [];')) {
  console.error('dist/sw.js has no placeholders: run `expo export -p web` again before this script.');
  process.exit(1);
}
const sw = template
  .replace("const VERSION = '__VERSION__';", `const VERSION = ${JSON.stringify(version)};`)
  .replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(precache)};`);
fs.writeFileSync(swFile, sw);
console.log(`Service worker precaches ${precache.length} files (${(bytes / 1024 / 1024).toFixed(1)} MB), version ${version}`);
