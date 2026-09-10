// Deployment/testing-tooling only. Under plain `node` (no React Native
// runtime), a couple of RN-only side-effect/storage modules that
// lib/supabase.tsx imports have no equivalent and aren't needed: Node
// already has a native URL implementation (no polyfill required), and
// AsyncStorage is only used for persisting an auth session across app
// restarts, which a short-lived local test/script never needs. alias-loader.mjs
// redirects those two specifiers here instead of trying to resolve the real
// (React-Native-only) packages.
export default { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };

// `react-native` also routes here (see alias-loader.mjs). lib/supabase.tsx
// reads AppState to drive Supabase's background token refresh from app
// foreground state — under plain Node there is no app lifecycle, so a
// permanently-"active" no-op is the correct stand-in.
export const AppState = {
  currentState: 'active',
  addEventListener: () => ({ remove() {} }),
};
