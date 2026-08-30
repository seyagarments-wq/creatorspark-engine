import { useEffect, useRef } from "react";

/**
 * Calls `callback` exactly once per session (per key) when `condition` becomes true.
 * Uses sessionStorage so it resets when the browser tab closes.
 * callback is stored in a ref to avoid infinite loops when inline functions are passed.
 */
export function useFirstVisitEffect(
  key: string,
  condition: boolean,
  callback: () => void
) {
  const calledRef = useRef(false);
  const callbackRef = useRef(callback);
  callbackRef.current = callback; // Always keep latest callback, no dep array issue

  useEffect(() => {
    if (!condition) return;
    if (calledRef.current) return;

    try {
      const hasSeen = sessionStorage.getItem(key);
      if (!hasSeen) {
        calledRef.current = true;
        sessionStorage.setItem(key, "1");
        callbackRef.current(); // Call via ref — stable, no loop
      }
    } catch {
      // sessionStorage may be unavailable (private mode) — silently skip
    }
  }, [condition, key]); // callback intentionally NOT in deps to prevent infinite loops
}
