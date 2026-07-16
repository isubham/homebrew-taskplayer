import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { SIDEBAR_FOLDER_MOTION } from "../constants";

interface FinderFolderContentProps {
  open: boolean;
  children: ReactNode;
}

export function FinderFolderContent({ open, children }: FinderFolderContentProps) {
  const reduceMotion = useReducedMotion();
  const openDuration = reduceMotion ? 0 : SIDEBAR_FOLDER_MOTION.openDurationSeconds;
  const closeDuration = reduceMotion ? 0 : SIDEBAR_FOLDER_MOTION.closeDurationSeconds;
  const fadeDuration = reduceMotion ? 0 : SIDEBAR_FOLDER_MOTION.fadeDurationSeconds;
  const revealOffset = reduceMotion ? 0 : SIDEBAR_FOLDER_MOTION.revealOffsetPx;

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          initial={{ height: 0, opacity: 0, y: revealOffset }}
          animate={{
            height: "auto",
            opacity: 1,
            y: 0,
            transition: {
              height: { duration: openDuration, ease: SIDEBAR_FOLDER_MOTION.ease },
              opacity: { duration: fadeDuration },
              y: { duration: openDuration, ease: SIDEBAR_FOLDER_MOTION.ease },
            },
          }}
          exit={{
            height: 0,
            opacity: 0,
            y: revealOffset,
            transition: {
              height: { duration: closeDuration, ease: SIDEBAR_FOLDER_MOTION.ease },
              opacity: { duration: fadeDuration },
              y: { duration: closeDuration, ease: SIDEBAR_FOLDER_MOTION.ease },
            },
          }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function FinderFolderChevron({ open }: { open: boolean }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.span
      className="ls-chevron"
      animate={{ rotate: open ? 90 : 0 }}
      transition={{
        duration: reduceMotion ? 0 : SIDEBAR_FOLDER_MOTION.closeDurationSeconds,
        ease: SIDEBAR_FOLDER_MOTION.ease,
      }}
      aria-hidden="true"
    >
      <ChevronRight size={SIDEBAR_FOLDER_MOTION.chevronSizePx} />
    </motion.span>
  );
}
