import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyAcX467m3_rDi7B88m2c-2UEbgqRoyXZps",
  authDomain: "creatorsctrl-notificatio-5ec92.firebaseapp.com",
  projectId: "creatorsctrl-notificatio-5ec92",
  storageBucket: "creatorsctrl-notificatio-5ec92.firebasestorage.app",
  messagingSenderId: "68773052442",
  appId: "1:68773052442:web:84916e52f4d81759c4d1a3",
  measurementId: "G-1TT3NZLZWR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Messaging instance (lazy initialized)
let messagingInstance: ReturnType<typeof getMessaging> | null = null;

export async function getFirebaseMessaging() {
  if (messagingInstance) return messagingInstance;
  
  const supported = await isSupported();
  if (!supported) {
    console.warn("Firebase Messaging is not supported in this browser");
    return null;
  }
  
  messagingInstance = getMessaging(app);
  return messagingInstance;
}

export async function requestFCMToken(): Promise<string | null> {
  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;

    // Register service worker first
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey: "BIgdQtIq_wiI04tQH3KDdfDxSxicjQw2GCz1LcBIYTcj6Op0Qv3TW4wL63Xdcj3ohsB9fdmFkV6_78wmUV-3NIk",
      serviceWorkerRegistration: registration,
    });

    if (token) {
      console.log("FCM Token obtained:", token.substring(0, 20) + "...");
      return token;
    } else {
      console.warn("No FCM token available");
      return null;
    }
  } catch (error) {
    console.error("Error getting FCM token:", error);
    return null;
  }
}

export function onForegroundMessage(callback: (payload: any) => void) {
  getFirebaseMessaging().then((messaging) => {
    if (!messaging) return;
    
    onMessage(messaging, (payload) => {
      console.log("Foreground message received:", payload);
      callback(payload);
    });
  });
}

export { app };
