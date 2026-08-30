import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect } from 'react';

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

  // Immediately apply update and reload when a new SW is detected
  useEffect(() => {
    if (needRefresh) {
      console.log('[PWA] New version detected, applying silently...');
      updateServiceWorker(true).then(() => {
        window.location.reload();
      });
    }
  }, [needRefresh, updateServiceWorker]);

  // No visible UI — updates are fully automatic
  return null;
}
