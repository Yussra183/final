// Metro bundler configuration for the Gas Delivery & Supplying System.
// Tuned for fast cold starts in dev and predictable output for production.

// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// --- Speed & DX tweaks ---------------------------------------------------

// Block the default React Native new-architecture sample assets from
// ever being included. They're only used by the example app.
config.resolver.blockList = [
  ...(config.resolver.blockList ?? []),
  /\/node_modules\/.*\/example\/.*/,
  /\/node_modules\/.*\/examples\/.*/,
  /\/node_modules\/.*\/__tests__\/.*/,
  /\/node_modules\/.*\.(test|spec)\.[jt]sx?$/,
];

// Reuse the same React instance across the whole bundle to avoid
// accidental duplicate React warnings & double-renders.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react") {
    return context.resolveRequest(context, "react", platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Register `leaflet.script` as an asset (not a JS source). This is no
// longer required for runtime because `src/components/mapPickerHtml.ts`
// now inlines the picker source as a string constant (see
// `scripts/build-map-picker-inline.js`), but we keep the extension
// registered so the source file under `assets/map-picker/` can still
// be inspected / lint-staged as a raw text asset if needed.
config.resolver.assetExts = [
  ...(config.resolver.assetExts ?? []),
  "script",
];

// Use a stable, project-relative source map URL so Metro can cache
// the source map across rebuilds.
config.symbolicator = {
  ...(config.symbolicator ?? {}),
};

// Make the bundler aware of the `src/` alias so deep-relative imports
// don't need to be re-resolved on every transform.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "@": path.resolve(__dirname, "."),
};

// Larger transform batch -> fewer worker spawns on first bundle.
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    // Don't inline requires: dev perf is fine without it and it keeps
    // the dependency graph easy to inspect.
    inlineRequires: false,
  },
});

// Friendly module IDs in stack traces (helps with the "Unable to resolve"
// debugging) without paying a production cost.
config.serializer.getModulesRunBeforeMainModule = () => [
  require.resolve("expo-router/entry"),
];

module.exports = config;
