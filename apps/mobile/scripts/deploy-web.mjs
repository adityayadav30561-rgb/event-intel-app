// Builds the web app and publishes it to EAS Hosting.
//   node scripts/deploy-web.mjs          → preview URL (review before going live)
//   node scripts/deploy-web.mjs --prod   → production URL (event-intelligence-india.expo.app)
// The build time is baked in so you can confirm on the phone (More tab) that an update arrived.
import { execSync } from 'node:child_process';

const prod = process.argv.includes('--prod');
const env = {
  ...process.env,
  EXPO_PUBLIC_BUILD_TIME: new Date().toISOString(),
  EXPO_PUBLIC_RELEASE: prod ? 'production' : 'preview',
  // Drops unused code from the bundle (about 20% smaller; checked screen by screen in Phase 9).
  EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH: '1',
  EXPO_UNSTABLE_TREE_SHAKING: '1',
};
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env });

run('node scripts/copy-map-worker.mjs');
run('npx expo export -p web --clear');
run('node scripts/postexport-web.mjs');
run(`npx --yes eas-cli@latest deploy ${prod ? '--prod ' : ''}--non-interactive`);
