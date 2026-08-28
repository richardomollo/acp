// ACP Intelligence™ — Beta Readiness Step 1. MuscleWiki's stream URLs
// require a short-lived media token (verified live: a bare stream URL
// returns 401). This hook resolves a persisted media URL for rendering —
// non-MuscleWiki URLs (the jsDelivr GIF fallback, etc.) pass through
// immediately and synchronously.
import { useEffect, useState } from 'react';
import { resolvePlayableMediaUrl, isMuscleWikiStreamUrl } from '@/services/providers/musclewiki-provider';

export function useMuscleWikiMedia(url: string | null): string | null {
  const [resolved, setResolved] = useState<string | null>(url && !isMuscleWikiStreamUrl(url) ? url : null);

  useEffect(() => {
    let active = true;
    if (!url) { setResolved(null); return; }
    if (!isMuscleWikiStreamUrl(url)) { setResolved(url); return; }
    setResolved(null); // don't render a stale/wrong-exercise token URL while the new one resolves
    resolvePlayableMediaUrl(url).then(u => { if (active) setResolved(u); });
    return () => { active = false; };
  }, [url]);

  return resolved;
}
