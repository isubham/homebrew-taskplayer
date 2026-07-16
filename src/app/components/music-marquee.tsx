import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  MUSIC_MARQUEE_GAP_PX,
  MUSIC_MARQUEE_MIN_DURATION_SECONDS,
  MUSIC_MARQUEE_PIXELS_PER_SECOND,
} from "../constants.jsx";

type MusicMarqueeProps = {
  text: string;
};

export function MusicMarquee({ text }: MusicMarqueeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [travelDistance, setTravelDistance] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const container = containerRef.current;
    const textElement = textRef.current;
    if (!container || !textElement) return;

    const measureOverflow = () => {
      const textWidth = textElement.getBoundingClientRect().width;
      const overflows = textWidth > container.clientWidth;
      setTravelDistance(overflows ? textWidth + MUSIC_MARQUEE_GAP_PX : 0);
    };
    const observer = new ResizeObserver(measureOverflow);

    measureOverflow();
    observer.observe(container);
    observer.observe(textElement);
    return () => observer.disconnect();
  }, [text]);

  const shouldAnimate = travelDistance > 0 && !reduceMotion;
  const duration = Math.max(
    MUSIC_MARQUEE_MIN_DURATION_SECONDS,
    travelDistance / MUSIC_MARQUEE_PIXELS_PER_SECOND,
  );

  return (
    <div ref={containerRef} className={`music-title${shouldAnimate ? " scrolling" : ""}`}>
      <motion.div
        className="music-title-track"
        animate={{ x: shouldAnimate ? [0, -travelDistance] : 0 }}
        transition={shouldAnimate ? { duration, ease: "linear", repeat: Infinity } : undefined}
      >
        <span ref={textRef} className="music-title-copy">{text}</span>
        {shouldAnimate && (
          <span
            className="music-title-copy music-title-clone"
            style={{ marginLeft: MUSIC_MARQUEE_GAP_PX }}
            aria-hidden="true"
          >
            {text}
          </span>
        )}
      </motion.div>
    </div>
  );
}
