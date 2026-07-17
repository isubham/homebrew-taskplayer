import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { listen } from "@tauri-apps/api/event";
import { commands, type MusicFavorite, type MusicFavoriteInput, type Snapshot } from "../bindings";
import { MUSIC_STORAGE_KEYS, TAURI_EVENT_STATE_CHANGED } from "../constants.jsx";
import type { MusicTrack } from "../music-catalog";

function normalizeTrack(track: Partial<MusicTrack>): MusicTrack | null {
  if (!track.id || !track.title || !track.artist) return null;
  if (track.sourceType !== "audius" && track.sourceType !== "noise") return null;
  return {
    id: String(track.id),
    title: String(track.title),
    artist: String(track.artist),
    artworkUrls: Array.isArray(track.artworkUrls)
      ? track.artworkUrls.filter((url): url is string => typeof url === "string")
      : [],
    permalink: typeof track.permalink === "string" ? track.permalink : null,
    sourceType: track.sourceType,
  };
}

function readLegacyFavorites(): MusicTrack[] {
  try {
    const saved = JSON.parse(localStorage.getItem(MUSIC_STORAGE_KEYS.favorites) || "[]");
    if (!Array.isArray(saved)) return [];
    const unique = new Map<string, MusicTrack>();
    saved.forEach((value) => {
      const track = normalizeTrack(value);
      if (track) unique.set(track.id, track);
    });
    return [...unique.values()];
  } catch {
    return [];
  }
}

function fromStored(favorite: MusicFavorite): MusicTrack | null {
  return normalizeTrack({
    id: favorite.trackId,
    title: favorite.title,
    artist: favorite.artist,
    artworkUrls: favorite.artworkUrls,
    permalink: favorite.permalink,
    sourceType: favorite.sourceType as MusicTrack["sourceType"],
  });
}

function toInput(track: MusicTrack): MusicFavoriteInput {
  return {
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    artworkUrls: track.artworkUrls,
    permalink: track.permalink,
    sourceType: track.sourceType,
  };
}

function tracksFromSnapshot(snapshot: Snapshot): MusicTrack[] {
  return snapshot.musicFavorites.map(fromStored).filter((track): track is MusicTrack => Boolean(track));
}

function sameTracks(current: MusicTrack[], next: MusicTrack[]) {
  if (current.length !== next.length) return false;
  return current.every((track, index) => {
    const candidate = next[index];
    return track.id === candidate.id
      && track.title === candidate.title
      && track.artist === candidate.artist
      && track.permalink === candidate.permalink
      && track.sourceType === candidate.sourceType
      && track.artworkUrls.length === candidate.artworkUrls.length
      && track.artworkUrls.every((url, artworkIndex) => url === candidate.artworkUrls[artworkIndex]);
  });
}

function updateFromSnapshot(
  setFavorites: Dispatch<SetStateAction<MusicTrack[]>>,
  snapshot: Snapshot,
) {
  const next = tracksFromSnapshot(snapshot);
  setFavorites((current) => sameTracks(current, next) ? current : next);
}

export function useMusicFavorites() {
  const [favorites, setFavorites] = useState<MusicTrack[]>([]);
  const favoriteIds = useMemo(() => new Set(favorites.map((track) => track.id)), [favorites]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    async function initialize() {
      const legacy = readLegacyFavorites();
      const snapshot = legacy.length
        ? await commands.importMusicFavorites(legacy.map(toInput))
        : await commands.getSnapshot();
      if (!active) return;
      updateFromSnapshot(setFavorites, snapshot);
      if (legacy.length) localStorage.removeItem(MUSIC_STORAGE_KEYS.favorites);
      unlisten = await listen<Snapshot>(TAURI_EVENT_STATE_CHANGED, ({ payload }) => {
        if (active) updateFromSnapshot(setFavorites, payload);
      });
      if (!active) unlisten();
    }

    initialize().catch((error) => console.error("Failed to load music favorites:", error));
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const toggleFavorite = useCallback(async (track: MusicTrack | null) => {
    if (!track) return;
    const snapshot = await commands.toggleMusicFavorite(toInput(track));
    updateFromSnapshot(setFavorites, snapshot);
  }, []);

  return {
    favorites,
    isFavorite: (track: MusicTrack | null) => Boolean(track && favoriteIds.has(track.id)),
    toggleFavorite,
  };
}
