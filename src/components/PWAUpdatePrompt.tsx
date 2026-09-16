import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect } from 'react';
import { isUploadInFlight, whenUploadsIdle } from '@/lib/upload-guard';

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (r) {
        // Check for updates every 5 minutes
        setInterval(() => {
          r.update();
        }, 5 * 60 * 1000);

        // Check immediately when the page becomes visible again
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            r.update();
          }
        });
      }
    },
    onRegisterError(error) {
      console.error('SW registration error:', error);
    },
  });

  // Apply the update and reload when a new SW is detected, but never while a
  // creator has an upload in flight: a reload mid-upload throws the file away
  // with no error shown. Wait for the upload to finish, then reload.
  useEffect(() => {
    if (!needRefresh) return;
    let cancelled = false;
    const apply = async () => {
      if (isUploadInFlight()) {
        console.log('[PWA] New version detected, waiting for uploads to finish...');
        await whenUploadsIdle();
      }
      if (cancelled) return;
      console.log('[PWA] New version detected, applying silently...');
      await updateServiceWorker(true);
      if (!cancelled) window.location.reload();
    };
    apply();
    return () => {
      cancelled = true;
    };
  }, [needRefresh, updateServiceWorker]);

  // No visible UI — updates are fully automatic
  return null;
}
