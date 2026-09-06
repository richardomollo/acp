// LANA — release hardening: host-specific root redirect.
//
// activecitypass.com/ (and www.activecitypass.com/) → /lana-pro/onboarding,
// as a TEMPORARY (307) redirect so the rollout stays reversible.
//
// This is the ONLY behavioural change: it fires strictly for
// `pathname === '/'` on those two hosts. Every other route, every other host,
// and every API path fall through untouched — and the destination is not '/',
// so there is no redirect loop.
//
// Pure + framework-free so it is fully unit-tested; the proxy middleware
// (apps/web/proxy.ts) is the only caller.

/** Hosts whose root redirects. Compared lowercased, with any :port stripped. */
const ROOT_REDIRECT_HOSTS: ReadonlySet<string> = new Set([
  "activecitypass.com",
  "www.activecitypass.com",
]);

/** Where a matched root request is sent. */
export const ROOT_REDIRECT_DESTINATION = "/lana-pro/onboarding";

/** Temporary — 307, deliberately NOT 308 — so the redirect can be pulled
 *  during rollout without a cached permanent redirect lingering. */
export const ROOT_REDIRECT_STATUS = 307;

export interface RootRedirectInput {
  /** raw Host header, e.g. "www.activecitypass.com" or "activecitypass.com:443" */
  host: string | null | undefined;
  /** URL pathname, e.g. "/" or "/lana-pro/home" */
  pathname: string;
  /** URL search string including the leading "?", or "" */
  search: string;
}

/**
 * The path (with query preserved) a request should be redirected to, or `null`
 * when it must NOT be redirected. Only an exact `pathname === '/'` on a
 * redirect host produces a target.
 */
export function rootRedirectTarget(input: RootRedirectInput): string | null {
  if (input.pathname !== "/") return null;

  const host = (input.host ?? "").trim().toLowerCase().split(":", 1)[0];
  if (!ROOT_REDIRECT_HOSTS.has(host)) return null;

  return `${ROOT_REDIRECT_DESTINATION}${input.search ?? ""}`;
}
