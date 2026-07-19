import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { MUSIC_COPY, MUSIC_DEFAULTS, MUSIC_FAVORITES_VIBE_KEY, MUSIC_STORAGE_KEYS, MUSIC_STORAGE_VALUES } from "./app/constants.jsx";
import { useMediaSession } from "./app/hooks/use-media-session.jsx";
import { useMusicBridge } from "./app/hooks/use-music-bridge.jsx";
import { audiusStreamUrl, fetchVibeTracks, type MusicTrack } from "./app/music-catalog.ts";
import { createWhiteNoiseUrl } from "./app/music-noise.ts";
import { LEGACY_MUSIC_VIBE_KEYS, MUSIC_VIBES } from "./app/music-vibes.ts";
import { useMusicFavorites } from "./app/hooks/use-music-favorites";
import { useAudioFade } from "./app/hooks/use-audio-fade";

export const GENRES = MUSIC_VIBES;

const MusicContext = createContext(null);

export function useMusic() {
  return useContext(MusicContext);
}

export function MusicProvider({ children }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const noiseUrlRef = useRef<string | null>(null);
  const activityRef = useRef(false);
  const [genre, setGenreState] = useState(() => {
    const saved = localStorage.getItem(MUSIC_STORAGE_KEYS.genre) || "";
    const migrated = LEGACY_MUSIC_VIBE_KEYS[saved] || saved;
    return GENRES[migrated] ? migrated : MUSIC_DEFAULTS.genre;
  });
  const [flowMusicEnabled, setFlowMusicEnabledState] = useState(() => {
    const saved = localStorage.getItem(MUSIC_STORAGE_KEYS.flowEnabled);
    return saved == null ? MUSIC_DEFAULTS.flowEnabled : saved === MUSIC_STORAGE_VALUES.enabled;
  });
  const [enabled, setEnabled] = useState(false);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [trackIdx, setTrackIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const currentTrack = tracks[trackIdx] || null;
  const { favorites, isFavorite, toggleFavorite } = useMusicFavorites();
  const { fadeInAndPlay, fadeOutAndPause, pauseImmediately } = useAudioFade(audioRef);

  const fetchAndLoadTracks = async (gKey) => {
    setLoading(true);
    const list = gKey === MUSIC_FAVORITES_VIBE_KEY
      ? favorites
      : await fetchVibeTracks(gKey);
    setTracks(list);
    setTrackIdx(0);
    setLoading(false);
    return list;
  };

  const play = async () => {
    if (!flowMusicEnabled) return;
    setEnabled(true);
    if (!tracks.length) {
      const list = await fetchAndLoadTracks(genre);
      if (!list.length) setEnabled(false);
    } else if (enabled && audioRef.current?.paused) {
      await fadeInAndPlay().catch(console.error);
    }
  };

  const pause = () => {
    setEnabled(false);
  };

  const next = async () => {
    if (!flowMusicEnabled) return;
    if (!tracks.length) {
      setEnabled(true);
      const list = await fetchAndLoadTracks(genre);
      if (!list.length) setEnabled(false);
      return;
    }
    setTrackIdx((prev) => (prev + 1) % tracks.length);
  };

  const previous = async () => {
    if (!flowMusicEnabled) return;
    if (!tracks.length) {
      setEnabled(true);
      const list = await fetchAndLoadTracks(genre);
      if (!list.length) setEnabled(false);
      return;
    }
    setTrackIdx((prev) => (prev - 1 + tracks.length) % tracks.length);
  };

  const changeGenre = async (newGenre) => {
    if (!GENRES[newGenre]) return;
    setGenreState(newGenre);
    localStorage.setItem(MUSIC_STORAGE_KEYS.genre, newGenre);
    pauseImmediately();
    setTracks([]);
    setTrackIdx(0);
    setLoading(true);
    const list = newGenre === MUSIC_FAVORITES_VIBE_KEY
      ? favorites
      : await fetchVibeTracks(newGenre);
    setTracks(list);
    setTrackIdx(0);
    setLoading(false);
    if (!list.length) setEnabled(false);
  };

  const setActive = (on) => {
    activityRef.current = on;
    setEnabled(on && flowMusicEnabled);
  };

  const setFlowMusicEnabled = (on) => {
    const nextEnabled = !!on;
    localStorage.setItem(
      MUSIC_STORAGE_KEYS.flowEnabled,
      nextEnabled ? MUSIC_STORAGE_VALUES.enabled : MUSIC_STORAGE_VALUES.disabled,
    );
    setFlowMusicEnabledState(nextEnabled);
    setEnabled(nextEnabled && activityRef.current);
  };

  // When track index or tracks change, update source and play if enabled.
  useEffect(() => {
    if (audioRef.current && currentTrack) {
      const isNoise = currentTrack.sourceType === "noise";
      if (isNoise && !noiseUrlRef.current) noiseUrlRef.current = createWhiteNoiseUrl();
      audioRef.current.loop = isNoise;
      audioRef.current.src = isNoise ? noiseUrlRef.current : audiusStreamUrl(currentTrack);
    }
  }, [currentTrack?.id, currentTrack?.sourceType]);

  useEffect(() => () => {
    if (noiseUrlRef.current) URL.revokeObjectURL(noiseUrlRef.current);
  }, []);

  useEffect(() => {
    if (genre !== MUSIC_FAVORITES_VIBE_KEY) return;
    const activeTrackId = tracks[trackIdx]?.id;
    const nextIndex = favorites.findIndex((track) => track.id === activeTrackId);
    setTracks(favorites);
    setTrackIdx(nextIndex >= 0 ? nextIndex : 0);
    if (!favorites.length) {
      setEnabled(false);
    }
  }, [favorites, genre]);

  // When enabled status changes
  useEffect(() => {
    if (enabled) {
      if (!tracks.length && !loading) {
        fetchAndLoadTracks(genre);
      } else if (currentTrack) {
        fadeInAndPlay().catch(console.error);
      }
    } else {
      fadeOutAndPause();
    }
  }, [enabled, currentTrack?.id]);

  const handleEnded = () => {
    next();
  };

  const handleError = () => {
    if (tracks.length && trackIdx < tracks.length - 1) {
      next();
    }
  };

  const handlePlayStatusChange = () => {
    if (audioRef.current) {
      setPlaying(!audioRef.current.paused);
    }
  };

  // Derive music state snapshot
  const musicState = {
    playing,
    enabled,
    flowMusicEnabled,
    loading,
    genre,
    genreLabel: GENRES[genre].label,
    name: loading ? MUSIC_COPY.loadingTitle : (currentTrack ? `${currentTrack.title} — ${currentTrack.artist}` : MUSIC_COPY.fallbackTitle),
    title: currentTrack ? currentTrack.title : null,
    artist: currentTrack ? currentTrack.artist : null,
    artworkUrls: currentTrack ? currentTrack.artworkUrls : [],
    permalink: currentTrack ? currentTrack.permalink : null,
    favoriteCount: favorites.length,
    isFavorite: isFavorite(currentTrack),
  };

  useMediaSession(currentTrack, playing, { play, pause, next, previous });
  useMusicBridge(musicState, { setActive, play, pause, next, previous, setGenre: changeGenre }, GENRES);

  return (
    <MusicContext.Provider value={{
      musicState,
      play,
      pause,
      next,
      previous,
      toggleFavorite: () => toggleFavorite(currentTrack),
      setGenre: changeGenre,
      setActive,
      setFlowMusicEnabled,
      GENRES
    }}>
      <audio
        ref={audioRef}
        preload="none"
        onEnded={handleEnded}
        onError={handleError}
        onPlay={handlePlayStatusChange}
        onPause={handlePlayStatusChange}
      />
      {children}
    </MusicContext.Provider>
  );
}
