// Deployment/testing-tooling helper only. Plain `node script.ts` (this
// repo's established way to run authoring scripts, per meal-composer.ts's
// own `.ts`-extension relative imports) has no bundler, so it can't resolve
// the `@/...` path alias tsconfig.json defines for Expo/Metro, and several
// `services/*.ts` files (written for Metro's bundler resolution, unlike the
// `lib/nutrition/**` authoring files) import sibling modules without an
// explicit extension. Rather than fork copies of real app modules just to
// avoid these two mechanical resolution gaps (Production Deployment Package
// spec's own §2/§7 precedent: reuse the app's real code, no parallel
// logic), this tiny Node loader:
//   1. rewrites `@/` to the apps/mobile root,
//   2. retries any extensionless specifier (alias or relative) with
//      `.ts`/`.tsx` appended when plain resolution fails,
//   3. strips `.tsx` files as plain TypeScript (Node's built-in stripping
//      only recognises `.ts`/`.mts`/`.cts` by extension; none of this app's
//      `.tsx` files under lib/services actually contain JSX — the
//      extension is a Metro/RN convention, not a real syntax signal),
//   4. stubs two React-Native-only side-effect/storage imports that have no
//      meaning under plain Node and aren't needed by a short-lived script/
//      test (Node has a native URL implementation; AsyncStorage is only for
//      persisting an auth session across app restarts).
// Nothing here changes what any of this code actually DOES — purely module
// resolution/loading plumbing so real app modules can run under plain node.
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = pathToFileURL(path.resolve(import.meta.dirname, '..') + '/').href;
const STUB = pathToFileURL(path.resolve(import.meta.dirname, 'rn-stub.mjs')).href;
const STUBBED_SPECIFIERS = new Set(['react-native-url-polyfill/auto', '@react-native-async-storage/async-storage']);

async function resolveWithExtensionFallback(base, context, nextResolve) {
  if (path.extname(base)) return nextResolve(base, context);
  let lastErr;
  for (const ext of ['.ts', '.tsx']) {
    try {
      return await nextResolve(base + ext, context);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function resolve(specifier, context, nextResolve) {
  if (STUBBED_SPECIFIERS.has(specifier)) {
    return nextResolve(STUB, context);
  }
  if (specifier.startsWith('@/')) {
    return resolveWithExtensionFallback(ROOT + specifier.slice(2), context, nextResolve);
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    try {
      return await nextResolve(specifier, context);
    } catch (e) {
      if (path.extname(specifier)) throw e;
      const base = new URL(specifier, context.parentURL).href;
      return resolveWithExtensionFallback(base, context, nextResolve);
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.tsx')) {
    const source = readFileSync(fileURLToPath(url), 'utf8');
    return { format: 'module', source: stripTypeScriptTypes(source), shortCircuit: true };
  }
  return nextLoad(url, context);
}
