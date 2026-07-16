import React, { useEffect, useRef, useState } from "react";
import { STICKY_SCROLL_ROOT_SELECTOR, STICKY_TITLE_SELECTOR } from "../constants.jsx";

export function StickyHeader({ icon, name }) {
  const headerRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const header = headerRef.current;
    const scrollRoot = header?.closest(STICKY_SCROLL_ROOT_SELECTOR);
    const title = scrollRoot?.querySelector(STICKY_TITLE_SELECTOR);
    if (!header || !scrollRoot || !title) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { root: scrollRoot, threshold: 0 }
    );
    observer.observe(title);
    return () => observer.disconnect();
  }, [name]);

  return (
    <div ref={headerRef} className={`stickybar${visible ? " show" : ""}`}>
      <span className="sb-icon">{icon}</span>
      <span className="sb-name">{name}</span>
    </div>
  );
}

// Backward-compatible export
export const stickyHeader = (props) => <StickyHeader {...props} />;
