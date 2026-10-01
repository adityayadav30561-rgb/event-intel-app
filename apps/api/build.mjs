// Bundles the API into dist/server.js. The shared workspace package (TypeScript source) is
// compiled in; npm dependencies stay external and are installed on the host.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  plugins: [
    {
      name: 'externalize-npm-packages',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) => (args.path.startsWith('@eii/') ? undefined : { path: args.path, external: true }));
      },
    },
  ],
});
