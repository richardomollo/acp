// Deployment/testing-tooling only. Under plain `node` (no React Native
// runtime), a couple of RN-only side-effect/storage modules that
// lib/supabase.tsx imports have no equivalent and aren't needed: Node
// already has a native URL implementation (no polyfill required), and
// AsyncStorage is only used for persisting an auth session across app
// restarts, which a short-lived local test/script never needs. alias-loader.mjs
// redirects those two specifiers here instead of trying to resolve the real
// (React-Native-only) packages.
export default { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
