// ACP Intelligence™ — Chunk 4.5C1. Real MuscleWiki media is a genuine MP4
// video (raw.videos[].url, persisted verbatim into exercises.gif_url — a
// legacy column name from the ExerciseDB era, but it now contains a real
// video stream URL for any source='musclewiki' row, not a GIF). Both
// workout-detail.tsx and workout-player.tsx were rendering this through
// React Native's core <Image>, which can only decode static image formats
// (PNG/JPEG/GIF/WebP) — it silently cannot play an .mp4 regardless of
// whether the URL is even reachable, which is the actual root cause videos
// never appeared. This component is the one place that decides image vs
// video and owns the MuscleWiki token resolution (useMuscleWikiMedia),
// instead of duplicating that branch in every screen that shows exercise
// media.
import { useEffect, useState } from 'react';
import { Image, type StyleProp, type ImageStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useMuscleWikiMedia } from '@/hooks/use-musclewiki-media';
import { isMuscleWikiStreamUrl } from '@/services/providers/musclewiki-provider';

// Both callers pass a plain {width, height} StyleSheet entry — typed as
// ImageStyle (satisfied by both call sites) and cast for VideoView (which
// wants ViewStyle) since RN's Image/View style types are incompatible on a
// couple of unrelated fields (e.g. `overflow`) neither caller actually sets.
export function ExerciseMedia({ url, style }: { url: string | null; style: StyleProp<ImageStyle> }) {
  const resolvedUrl = useMuscleWikiMedia(url);
  const isVideo = !!resolvedUrl && isMuscleWikiStreamUrl(resolvedUrl);

  // Only the real MuscleWiki stream URLs are video — the jsDelivr GIF
  // fallback used by historical/ExerciseDB-era rows (and ACP's own
  // fallback exercises) is a genuine static image and keeps rendering
  // through <Image> exactly as before (section 8D — never break those).
  const player = useVideoPlayer(isVideo ? resolvedUrl : null, p => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // A player that fails to load (expired/invalid token, network hiccup) —
  // never show a broken video container (section 7); just render nothing,
  // same as the "no media at all" case.
  const [videoFailed, setVideoFailed] = useState(false);
  useEffect(() => {
    setVideoFailed(false);
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') setVideoFailed(true);
    });
    return () => sub.remove();
  }, [player, resolvedUrl]);

  if (!resolvedUrl) return null;

  if (isVideo) {
    if (videoFailed) return null;
    return <VideoView player={player} style={style as any} contentFit="contain" nativeControls={false} />;
  }

  return <Image source={{ uri: resolvedUrl }} style={style} resizeMode="contain" />;
}
