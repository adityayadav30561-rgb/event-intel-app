// Renders the app icon, splash, favicon and home-screen icons from a vector mark:
// a calendar outline with a saffron location dot, on the brand navy.
// Usage: npm run generate:icons   (uses sharp from devDependencies)
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'assets', 'images');
const web = path.join(root, 'public', 'icons');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(web, { recursive: true });

const NAVY = '#17306B', NAVY_DARK = '#0F2250', WHITE = '#FFFFFF', SAFFRON = '#F08A24', INK = '#111827';

/** Calendar + location dot, drawn in a 100×100 box. */
const mark = (size, x = 0, y = 0, stroke = WHITE, dot = SAFFRON) => `
  <g transform="translate(${x} ${y}) scale(${size / 100})">
    <rect x="18" y="26" width="64" height="56" rx="10" fill="none" stroke="${stroke}" stroke-width="6"/>
    <line x1="18" y1="42" x2="82" y2="42" stroke="${stroke}" stroke-width="6"/>
    <line x1="35" y1="18" x2="35" y2="32" stroke="${stroke}" stroke-width="6" stroke-linecap="round"/>
    <line x1="65" y1="18" x2="65" y2="32" stroke="${stroke}" stroke-width="6" stroke-linecap="round"/>
    <path d="M50 52 c-7.2 0 -12 5.2 -12 11.4 c0 8.2 12 17.6 12 17.6 s12 -9.4 12 -17.6 C62 57.2 57.2 52 50 52 z" fill="${dot}"/>
    <circle cx="50" cy="63.5" r="4.2" fill="${stroke === WHITE ? NAVY : WHITE}"/>
  </g>`;

const svg = (w, h, body, bg) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${NAVY}"/><stop offset="1" stop-color="${NAVY_DARK}"/></linearGradient></defs>` +
      `${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${body}</svg>`,
  );

const tile = (size, pad) => svg(size, size, mark(size * (1 - pad * 2), size * pad, size * pad), 'url(#g)');

const wordmark = (cx, y) => `
  <g font-family="Segoe UI, Helvetica, Arial, sans-serif" text-anchor="middle">
    <text x="${cx}" y="${y}" font-size="52" font-weight="700" fill="${INK}">Event Intelligence</text>
    <text x="${cx}" y="${y + 48}" font-size="26" font-weight="600" letter-spacing="10" fill="${SAFFRON}">INDIA</text>
  </g>`;

const jobs = [
  [path.join(out, 'icon.png'), tile(1024, 0.16)],
  [path.join(out, 'favicon.png'), svg(64, 64, `<rect width="64" height="64" rx="14" fill="url(#g)"/>${mark(52, 6, 6)}`)],
  [
    path.join(out, 'splash-icon.png'),
    svg(800, 600, `<rect x="300" y="40" width="200" height="200" rx="44" fill="url(#g)"/>${mark(150, 325, 65)}${wordmark(400, 350)}`),
  ],
  [path.join(web, 'icon-192.png'), tile(192, 0.16)],
  [path.join(web, 'icon-512.png'), tile(512, 0.16)],
  [path.join(web, 'icon-maskable-512.png'), tile(512, 0.24)],
  [path.join(web, 'apple-touch-icon.png'), tile(180, 0.16)],
];

for (const [dest, buf] of jobs) {
  await sharp(buf).png().toFile(dest);
  const meta = await sharp(dest).metadata();
  console.log(`${path.relative(root, dest)}: ${meta.width}x${meta.height}`);
}
