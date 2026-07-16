import React from "react";
import { motion } from "motion/react";

interface AnimatedModalProps {
  onClose: () => void;
  className?: string;
  overlayClassName?: string;
  id?: string;
  children: React.ReactNode;
}

export function AnimatedModal({
  onClose,
  className = "modal dlg show",
  overlayClassName = "overlay show",
  id = "dmodal",
  children
}: AnimatedModalProps) {
  return (
    <motion.div
      className={overlayClassName}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={(e) => {
        if (e.target instanceof HTMLElement && e.target.className.includes("overlay")) {
          onClose();
        }
      }}
    >
      <motion.div
        className={className}
        id={id}
        initial={{ opacity: 0, scale: 0.97, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 15 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

interface AnimatedPageProps {
  viewKey: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function AnimatedPage({ viewKey, className, style, children }: AnimatedPageProps) {
  return (
    <motion.div
      key={viewKey}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className={className}
      style={{ minHeight: "100%", display: "flex", flexDirection: "column", ...style }}
    >
      {children}
    </motion.div>
  );
}

interface AnimatedContextMenuProps {
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function AnimatedContextMenu({ id, className = "popmenu", style, children }: AnimatedContextMenuProps) {
  return (
    <motion.div
      id={id}
      className={className}
      style={style}
      initial={{ opacity: 0, scale: 0.9, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -10 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

interface AnimatedToastProps {
  className?: string;
  children: React.ReactNode;
}

export function AnimatedToast({ className, children }: AnimatedToastProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

interface AnimatedSlidePanelProps {
  id?: string;
  className?: string;
  overlayClassName?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function AnimatedSlidePanel({
  id = "lyrmodal",
  className = "lyrpanel show",
  overlayClassName = "overlay show",
  onClose,
  children
}: AnimatedSlidePanelProps) {
  return (
    <motion.div
      className={overlayClassName}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={(e) => {
        if (e.target instanceof HTMLElement && e.target.className.includes("overlay")) {
          onClose();
        }
      }}
    >
      <motion.div
        className={className}
        id={id}
        initial={{ opacity: 0, scale: 0.97, x: 50 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.97, x: 50 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

interface AnimatedSpinnerProps {
  title?: string;
  children: React.ReactNode;
}

export function AnimatedSpinner({ title, children }: AnimatedSpinnerProps) {
  return (
    <motion.span
      style={{ display: "inline-flex", color: "var(--accent, var(--green))", width: "12px", height: "12px" }}
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
      title={title}
    >
      {children}
    </motion.span>
  );
}
