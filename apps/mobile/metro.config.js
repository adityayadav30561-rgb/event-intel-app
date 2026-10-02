// Metro configuration: Expo's defaults (monorepo-aware) plus one web-only trim.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The app animates with React Native's Animated API and never uses Reanimated. Gesture Handler
// loads it only if present and falls back without it, so on the web it resolves to an empty
// module, keeping about 750 KB out of the download.
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'react-native-reanimated' || moduleName.startsWith('react-native-reanimated/'))) {
    return { type: 'empty' };
  }
  return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
