/**
 * Tracks uploads in flight so nothing reloads the page underneath them.
 * The PWA auto-updater checks `isUploadInFlight()` before calling
 * window.location.reload(); a reload mid-upload is what made the first
 * creator upload "vanish" on 2026-09-15.
 */
let inFlight = 0;
const listeners = new Set<() => void>();

export function beginUpload(): () => void {
  inFlight += 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    inFlight = Math.max(0, inFlight - 1);
    if (inFlight === 0) listeners.forEach((fn) => fn());
  };
}

export function isUploadInFlight(): boolean {
  return inFlight > 0;
}

/** Resolves as soon as no upload is in flight. */
export function whenUploadsIdle(): Promise<void> {
  if (inFlight === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      listeners.delete(done);
      resolve();
    };
    listeners.add(done);
  });
}
