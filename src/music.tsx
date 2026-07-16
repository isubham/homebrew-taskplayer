import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { MUSIC_COPY, MUSIC_DEFAULTS, MUSIC_STORAGE_KEYS } from "./app/constants.jsx";
import { useMediaSession } from "./app/hooks/use-media-session.jsx";
import { useMusicBridge } from "./app/hooks/use-music-bridge.jsx";
import { audiusStreamUrl, fetchVibeTracks, type MusicTrack } from "./app/music-catalog.ts";
import { createWhiteNoiseUrl } from "./app/music-noise.ts";
import { LEGACY_MUSIC_VIBE_KEYS, MUSIC_VIBES } from "./app/music-vibes.ts";

export const GENRES = MUSIC_VIBES;

const MusicContext = createContext(null);

export function useMusic() {
  return useContext(MusicContext);
}

export function MusicProvider({ children }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const noiseUrlRef = useRef<string | null>(null);
  const [genre, setGenreState] = useState(() => {
    const saved = localStorage.getItem(MUSIC_STORAGE_KEYS.genre) || "";
    const migrated = LEGACY_MUSIC_VIBE_KEYS[saved] || saved;
    return GENRES[migrated] ? migrated : MUSIC_DEFAULTS.genre;
  });
  const [enabled, setEnabled] = useState(false);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [trackIdx, setTrackIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const currentTrack = tracks[trackIdx] || null;

  const fetchAndLoadTracks = async (gKey) => {
    setLoading(true);
    const list = await fetchVibeTracks(gKey);
    setTracks(list);
    setTrackIdx(0);
    setLoading(false);
  };

  const play = async () => {
    setEnabled(true);
    if (!tracks.length) {
      await fetchAndLoadTracks(genre);
    } else {
      await audioRef.current?.play().catch(console.error);
    }
  };

  const pause = () => {
    setEnabled(false);
    audioRef.current?.pause();
  };

  const next = async () => {
    if (!tracks.length) {
      setEnabled(true);
      await fetchAndLoadTracks(genre);
      return;
    }
    setTrackIdx((prev) => (prev + 1) % tracks.length);
  };

  const previous = async () => {
    if (!tracks.length) {
      setEnabled(true);
      await fetchAndLoadTracks(genre);
      return;
    }
    setTrackIdx((prev) => (prev - 1 + tracks.length) % tracks.length);
  };

  const changeGenre = async (newGenre) => {
    if (!GENRES[newGenre]) return;
    setGenreState(newGenre);
    localStorage.setItem(MUSIC_STORAGE_KEYS.genre, newGenre);
    setTracks([]);
    setTrackIdx(0);
    setLoading(true);
    const list = await fetchVibeTracks(newGenre);
    setTracks(list);
    setTrackIdx(0);
    setLoading(false);
  };

  const setActive = (on) => {
    setEnabled(on);
  };

  // When track index or tracks change, update source and play if enabled.
  useEffect(() => {
    if (audioRef.current && currentTrack) {
      const isNoise = currentTrack.sourceType === "noise";
      if (isNoise && !noiseUrlRef.current) noiseUrlRef.current = createWhiteNoiseUrl();
      audioRef.current.loop = isNoise;
      audioRef.current.src = isNoise ? noiseUrlRef.current : audiusStreamUrl(currentTrack);
      if (enabled) {
        audioRef.current.play().catch((err) => {
          console.warn("Playback failed, trying next track", err);
          next();
        });
      }
    }
  }, [currentTrack]);

  useEffect(() => () => {
    if (noiseUrlRef.current) URL.revokeObjectURL(noiseUrlRef.current);
  }, []);

  // When enabled status changes
  useEffect(() => {
    if (enabled) {
      if (!tracks.length && !loading) {
        fetchAndLoadTracks(genre);
      } else if (audioRef.current?.paused) {
        audioRef.current.play().catch(console.error);
      }
    } else {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    }
  }, [enabled]);

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
    loading,
    genre,
    genreLabel: GENRES[genre].label,
    name: loading ? MUSIC_COPY.loadingTitle : (currentTrack ? `${currentTrack.title} — ${currentTrack.artist}` : MUSIC_COPY.fallbackTitle),
    title: currentTrack ? currentTrack.title : null,
    artist: currentTrack ? currentTrack.artist : null,
    artworkUrls: currentTrack ? currentTrack.artworkUrls : [],
    permalink: currentTrack ? currentTrack.permalink : null,
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
      setGenre: changeGenre,
      setActive,
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
