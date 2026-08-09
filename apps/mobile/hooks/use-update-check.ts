import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const BUNDLE_ID = 'com.activecitypass.app';

function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

async function fetchiOSVersion(): Promise<{ version: string; url: string } | null> {
  const res = await fetch(
    `https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}`,
    { headers: { 'Cache-Control': 'no-cache' } },
  );
  const data = await res.json();
  const result = data?.results?.[0];
  if (!result?.version) return null;
  return {
    version: result.version,
    url: `https://apps.apple.com/app/id${result.trackId}`,
  };
}

async function fetchAndroidVersion(): Promise<{ version: string; url: string } | null> {
  const url = `https://play.google.com/store/apps/details?id=${BUNDLE_ID}&hl=en`;
  const res = await fetch(url);
  const html = await res.text();
  // Google Play embeds the version in a structured data attribute
  const match = html.match(/\[\[\["(\d+\.\d+(?:\.\d+)?)"\]\]/);
  const version = match?.[1] ?? null;
  if (!version) return null;
  return { version, url };
}

export type UpdateCheckResult = {
  updateAvailable: boolean;
  storeUrl: string;
};

export function useUpdateCheck(): UpdateCheckResult {
  const [result, setResult] = useState<UpdateCheckResult>({
    updateAvailable: false,
    storeUrl: '',
  });

  useEffect(() => {
    const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

    const check = async () => {
      try {
        const store =
          Platform.OS === 'ios'
            ? await fetchiOSVersion()
            : await fetchAndroidVersion();
        if (store && semverGt(store.version, currentVersion)) {
          setResult({ updateAvailable: true, storeUrl: store.url });
        }
      } catch {
        // Silently ignore — network errors should never break the app
      }
    };

    check();
  }, []);

  return result;
}
