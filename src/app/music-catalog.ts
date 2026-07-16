import { MUSIC_API_BASE, MUSIC_APP_NAME, MUSIC_COPY } from "./constants.jsx";
import { MUSIC_VIBES, type AudiusVibeSource } from "./music-vibes.ts";

const AUDIUS_RESULT_LIMIT = 50;
const CATALOG_LIMIT = 50;
const MIN_TRACK_DURATION_SECONDS = 30;
const AUDIUS_PUBLIC_ORIGIN = "https://audius.co";

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  artworkUrls: string[];
  permalink: string | null;
  sourceType: "audius" | "noise";
};

const LOCAL_NOISE_TRACK: MusicTrack = {
  id: "taskplayer-white-noise",
  title: "White noise",
  artist: MUSIC_APP_NAME,
  artworkUrls: [],
  permalink: null,
  sourceType: "noise",
};

function artworkUrls(track: any) {
  const primary = track.artwork?.["480x480"] || track.artwork?.["150x150"];
  if (!primary) return [];
  try {
    const url = new URL(primary);
    const hosts = [url.origin, ...(track.artwork.mirrors || [])];
    return [...new Set(hosts)].map((host) => `${host}${url.pathname}`);
  } catch {
    return [primary];
  }
}

function searchableText(track: any) {
  return [track.title, track.description, track.tags].filter(Boolean).join(" ").toLowerCase();
}

function matchesSource(track: any, source: AudiusVibeSource) {
  const text = searchableText(track);
  if (source.allowedGenres && !source.allowedGenres.includes(track.genre)) return false;
  if (source.includeTerms && !source.includeTerms.some((term) => text.includes(term))) return false;
  if (source.excludeTerms?.some((term) => text.includes(term))) return false;
  return true;
}

function isUsable(track: any) {
  return track.is_streamable !== false
    && !track.is_delete
    && !track.is_stream_gated
    && track.duration > MIN_TRACK_DURATION_SECONDS;
}

async function fetchSource(source: AudiusVibeSource) {
  const path = source.type === "genre" ? "trending" : "search";
  const parameter = source.type === "genre" ? "genre" : "query";
  const url = `${MUSIC_API_BASE}/v1/tracks/${path}?${parameter}=${encodeURIComponent(source.value)}&limit=${AUDIUS_RESULT_LIMIT}&app_name=${MUSIC_APP_NAME}`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const payload = await response.json();
  return (payload.data || []).filter((track) => isUsable(track) && matchesSource(track, source));
}

export async function fetchVibeTracks(vibeKey: string): Promise<MusicTrack[]> {
  const vibe = MUSIC_VIBES[vibeKey] || MUSIC_VIBES.lofi;
  if (vibe.sourceType === "noise") return [LOCAL_NOISE_TRACK];

  try {
    const batches = await Promise.all(
      vibe.sources.map((source) => fetchSource(source).catch(() => [])),
    );
    const unique = new Map<string, any>();
    batches.flat().forEach((track) => unique.set(track.id, track));
    const preferredMoods = new Set(vibe.preferredMoods || []);
    const ranked = [...unique.values()].sort((a, b) => {
      const moodDifference = Number(preferredMoods.has(b.mood)) - Number(preferredMoods.has(a.mood));
      return moodDifference || (b.play_count || 0) - (a.play_count || 0);
    });

    return ranked.slice(0, CATALOG_LIMIT).map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.user?.name || MUSIC_COPY.fallbackArtist,
      artworkUrls: artworkUrls(track),
      permalink: track.permalink ? `${AUDIUS_PUBLIC_ORIGIN}${track.permalink}` : null,
      sourceType: "audius",
    }));
  } catch {
    return [];
  }
}

export function audiusStreamUrl(track: MusicTrack) {
  return `${MUSIC_API_BASE}/v1/tracks/${track.id}/stream?app_name=${MUSIC_APP_NAME}`;
}
