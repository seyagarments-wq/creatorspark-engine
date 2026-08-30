import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { requestFCMToken, onForegroundMessage } from "@/lib/firebase";

// Detect iOS
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

// Detect if running as installed PWA (standalone mode)
const isPWAInstalled = () => {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
};

// Check if we should use native VAPID (iOS PWA) vs FCM (everything else)
const shouldUseNativeVAPID = () => isIOS() && isPWAInstalled();

// Convert base64 URL-safe string to Uint8Array for VAPID
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

// Get VAPID public key from Edge Function
async function getVAPIDPublicKey(): Promise<string | null> {
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) return null;

    const { data, error } = await supabase.functions.invoke("get-vapid-public-key");
    if (error) {
      console.error("Error fetching VAPID key:", error);
      return null;
    }
    return data?.publicKey || null;
  } catch (error) {
    console.error("Failed to get VAPID public key:", error);
    return null;
  }
}

// Native VAPID subscription for iOS PWA
async function subscribeWithVAPID(): Promise<PushSubscription | null> {
  try {
    // Ensure service worker is ready
    const registration = await navigator.serviceWorker.ready;

    // Get VAPID public key
    const vapidKey = await getVAPIDPublicKey();
    if (!vapidKey) {
      console.error("No VAPID public key available");
      return null;
    }

    // Subscribe using native PushManager
    const subscription = await (registration as any).pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    console.log("VAPID subscription created:", subscription.endpoint.substring(0, 50) + "...");
    return subscription;
  } catch (error) {
    console.error("Failed to subscribe with VAPID:", error);
    return null;
  }
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  // Check if push notifications are supported
  useEffect(() => {
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  // Check existing subscription status
  useEffect(() => {
    async function checkSubscription() {
      if (!isSupported || !user) {
        setIsLoading(false);
        return;
      }

      try {
        // Check if user has a push subscription stored
        const { data } = await supabase
          .from("push_subscriptions")
          .select("id")
          .eq("user_id", user.id)
          .limit(1);

        setIsSubscribed(!!data && data.length > 0);
      } catch (error) {
        console.error("Error checking push subscription:", error);
      } finally {
        setIsLoading(false);
      }
    }

    checkSubscription();
  }, [isSupported, user]);

  // Set up foreground message handler (FCM only - for non-iOS)
  useEffect(() => {
    if (!isSupported || !isSubscribed) return;
    // Only set up FCM foreground handler for non-iOS devices
    if (shouldUseNativeVAPID()) return;

    onForegroundMessage((payload) => {
      // Show in-app toast for foreground notifications
      toast({
        title: payload.notification?.title || payload.data?.title || "New Notification",
        description: payload.notification?.body || payload.data?.body,
      });
    });
  }, [isSupported, isSubscribed]);

  // Subscribe to push notifications
  const subscribe = useCallback(async () => {
    if (!isSupported) {
      toast({
        title: "Not supported",
        description: "Push notifications are not supported in this browser.",
        variant: "destructive",
      });
      return false;
    }

    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in first to enable push notifications.",
        variant: "destructive",
      });
      return false;
    }

    setIsLoading(true);

    try {
      // Request permission
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== "granted") {
        toast({
          title: "Permission denied",
          description: "You need to allow notifications to receive push alerts.",
          variant: "destructive",
        });
        setIsLoading(false);
        return false;
      }

      let subscriptionData: {
        endpoint: string;
        p256dh: string;
        auth: string;
      } | null = null;

      // Use native VAPID for iOS PWA, FCM for everything else
      if (shouldUseNativeVAPID()) {
        console.log("Using native VAPID for iOS PWA");
        
        // Register the standard sw.js for iOS
        await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        const subscription = await subscribeWithVAPID();
        if (!subscription) {
          toast({
            title: "Failed to enable notifications",
            description: "Could not create push subscription. Please try again.",
            variant: "destructive",
          });
          setIsLoading(false);
          return false;
        }

        const keys = subscription.toJSON().keys;
        subscriptionData = {
          endpoint: subscription.endpoint,
          p256dh: keys?.p256dh || "",
          auth: keys?.auth || "",
        };
      } else {
        console.log("Using FCM for non-iOS device");
        
        // Get FCM token for Android/Desktop
        const fcmToken = await requestFCMToken();
        if (!fcmToken) {
          toast({
            title: "Failed to enable notifications",
            description: "Could not get push notification token. Please try again.",
            variant: "destructive",
          });
          setIsLoading(false);
          return false;
        }

        subscriptionData = {
          endpoint: fcmToken, // Store FCM token in endpoint field
          p256dh: "fcm", // Marker to identify FCM tokens
          auth: "fcm",
        };
      }

      // Delete any existing subscriptions for this user first
      await supabase.from("push_subscriptions").delete().eq("user_id", user.id);

      // Save subscription to database
      const { error } = await supabase.from("push_subscriptions").insert({
        user_id: user.id,
        endpoint: subscriptionData.endpoint,
        p256dh: subscriptionData.p256dh,
        auth: subscriptionData.auth,
      });

      if (error) throw error;

      setIsSubscribed(true);
      toast({
        title: "Notifications enabled",
        description: "You'll now receive push notifications for important updates.",
      });

      return true;
    } catch (error) {
      console.error("Failed to subscribe to push notifications:", error);
      toast({
        title: "Failed to enable notifications",
        description: "Please try again later.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, isSupported]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    if (!user) return false;

    setIsLoading(true);

    try {
      // Remove from database
      await supabase.from("push_subscriptions").delete().eq("user_id", user.id);

      // For native VAPID, also unsubscribe from PushManager
      if (shouldUseNativeVAPID()) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await (registration as any).pushManager.getSubscription();
          if (subscription) {
            await subscription.unsubscribe();
          }
        } catch (e) {
          console.warn("Could not unsubscribe from PushManager:", e);
        }
      }

      setIsSubscribed(false);
      toast({
        title: "Notifications disabled",
        description: "You won't receive push notifications anymore.",
      });

      return true;
    } catch (error) {
      console.error("Failed to unsubscribe from push notifications:", error);
      toast({
        title: "Failed to disable notifications",
        description: "Please try again later.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    isConfigured: true,
    subscribe,
    unsubscribe,
  };
}
