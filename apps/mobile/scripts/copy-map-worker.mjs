// MapLibre 6 runs its tile worker from separate module files next to its own bundle. Metro bundles
// only the main file, so these two are copied into public/ (served as-is, same origin) and the map
// points at them with setWorkerUrl. Copied from node_modules so the version always matches.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const src = path.dirname(require.resolve('maplibre-gl/package.json'));
const out = path.resolve('public/maplibre');
fs.mkdirSync(out, { recursive: true });
for (const name of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) fs.copyFileSync(path.join(src, 'dist', name), path.join(out, name));
console.log('Copied the MapLibre worker into public/maplibre');
