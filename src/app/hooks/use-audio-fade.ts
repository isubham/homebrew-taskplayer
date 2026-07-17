import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  MUSIC_FADE_DURATION_MS,
  MUSIC_FADE_TICK_MS,
  MUSIC_VOLUME_FULL,
  MUSIC_VOLUME_MUTED,
} from "../constants";

export function useAudioFade(audioRef: RefObject<HTMLAudioElement>) {
  const timerRef = useRef<number | null>(null);
  const operationRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const beginOperation = useCallback(() => {
    operationRef.current += 1;
    clearTimer();
    return operationRef.current;
  }, [clearTimer]);

  const animateVolume = useCallback((
    audio: HTMLAudioElement,
    target: number,
    operation: number,
    onComplete?: () => void,
  ) => {
    const initial = audio.volume;
    const distance = Math.abs(target - initial);
    const duration = MUSIC_FADE_DURATION_MS * distance;
    if (duration === MUSIC_VOLUME_MUTED) {
      onComplete?.();
      return;
    }
    const startedAt = performance.now();
    timerRef.current = window.setInterval(() => {
      if (operation !== operationRef.current) return;
      const progress = Math.min(MUSIC_VOLUME_FULL, (performance.now() - startedAt) / duration);
      audio.volume = initial + ((target - initial) * progress);
      if (progress < MUSIC_VOLUME_FULL) return;
      clearTimer();
      onComplete?.();
    }, MUSIC_FADE_TICK_MS);
  }, [clearTimer]);

  const fadeInAndPlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    const operation = beginOperation();
    audio.volume = MUSIC_VOLUME_MUTED;
    await audio.play();
    if (operation !== operationRef.current) return;
    animateVolume(audio, MUSIC_VOLUME_FULL, operation);
  }, [animateVolume, audioRef, beginOperation]);

  const fadeOutAndPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const operation = beginOperation();
    if (audio.paused) {
      audio.volume = MUSIC_VOLUME_MUTED;
      return;
    }
    animateVolume(audio, MUSIC_VOLUME_MUTED, operation, () => audio.pause());
  }, [animateVolume, audioRef, beginOperation]);

  const pauseImmediately = useCallback(() => {
    const audio = audioRef.current;
    beginOperation();
    if (!audio) return;
    audio.pause();
    audio.volume = MUSIC_VOLUME_MUTED;
  }, [audioRef, beginOperation]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { fadeInAndPlay, fadeOutAndPause, pauseImmediately };
}
