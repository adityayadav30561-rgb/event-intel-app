// Injects installable web app (home-screen) metadata into the exported HTML.
// Expo's "single" web output uses a fixed HTML template, so this runs after `expo export -p web`.
// Files in public/ (manifest.json, icons/, sw.js) are copied into dist/ by the export itself.
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('dist/index.html');
let html = fs.readFileSync(file, 'utf8');

const head = `
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
