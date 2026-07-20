import { useEffect, useState } from "react";
import { SESSION_CLOCK_TICK_MS } from "../constants";

export function useSessionNow(activeSessionId?: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!activeSessionId) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), SESSION_CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, [activeSessionId]);
  return now;
}
