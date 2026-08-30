/**
 * Firebase Cloud Functions for Push Notifications
 * 
 * Two functions:
 * 1. sendApplePush - Handles Apple/Safari Web Push (VAPID encryption)
 * 2. sendFcm - Handles FCM via Admin SDK (Android/Desktop)
 * 
 * DEPLOYMENT STEPS:
 * 1. Create a Firebase project at https://console.firebase.google.com
 * 2. Enable Cloud Functions (requires Blaze plan)
 * 3. Copy this folder contents to your functions directory
 * 4. Set environment variables:
 *    firebase functions:config:set vapid.public="YOUR_VAPID_PUBLIC_KEY"
 *    firebase functions:config:set vapid.private="YOUR_VAPID_PRIVATE_KEY"
 *    firebase functions:config:set vapid.subject="mailto:contact@seyagarments.com"
 *    firebase functions:config:set auth.secret="YOUR_SHARED_SECRET"
 * 5. Deploy: firebase deploy --only functions
 * 6. Add the function URLs to Supabase secrets
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");
const cors = require("cors")({ origin: true });

// Initialize Firebase Admin SDK
admin.initializeApp();

// Helper: get config value from functions.config() OR process.env
const getConfigValue = (configPath, envName) => {
  try {
    const config = functions.config();
    const parts = configPath.split(".");
    let val = config;
    for (const p of parts) {
      val = val?.[p];
    }
    if (val) return val;
  } catch (e) {
    // functions.config() not available
  }
  return process.env[envName] || null;
};

// Initialize web-push with VAPID details
let webpushInitialized = false;

const initializeWebPush = () => {
  if (webpushInitialized) return;

  const vapidPublic = getConfigValue("vapid.public", "VAPID_PUBLIC_KEY");
  const vapidPrivate = getConfigValue("vapid.private", "VAPID_PRIVATE_KEY");
  const vapidSubject = getConfigValue("vapid.subject", "VAPID_SUBJECT") || "mailto:contact@seyagarments.com";

  console.log("VAPID init check:", { hasPublic: !!vapidPublic, hasPrivate: !!vapidPrivate, subject: vapidSubject });

  if (!vapidPublic || !vapidPrivate) {
    throw new Error(
      "VAPID keys not configured. Set via: firebase functions:config:set vapid.public=... vapid.private=... " +
      "OR set env vars VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY"
    );
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  webpushInitialized = true;
  console.log("Webpush initialized successfully");
};

/**
 * Send push notification to Apple/Safari Web Push endpoints
 * 
 * Expected request body:
 * {
 *   subscriptions: [
 *     { endpoint: "https://web.push.apple.com/...", p256dh: "...", auth: "..." }
 *   ],
 *   payload: {
 *     title: "Notification Title",
 *     body: "Notification body text",
 *     url: "/path/to/open",
 *     tag: "notification-tag"
 *   },
 *   authSecret: "shared-secret-for-verification"
 * }
 */
exports.sendApplePush = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Only allow POST
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      console.log("=== sendApplePush request received ===");
      console.log("Content-Type:", req.headers["content-type"]);
      console.log("Body keys:", Object.keys(req.body || {}));
      
      // Verify auth secret
      const expectedSecret = getConfigValue("auth.secret", "AUTH_SECRET");
      
      if (expectedSecret && req.body.authSecret !== expectedSecret) {
        console.error("Auth secret mismatch");
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Initialize web-push
      initializeWebPush();

      const { subscriptions, payload } = req.body;

      console.log("Subscriptions count:", subscriptions?.length);
      console.log("Payload:", JSON.stringify(payload));
      
      if (subscriptions?.length > 0) {
        console.log("First subscription shape:", {
          hasEndpoint: !!subscriptions[0].endpoint,
          hasP256dh: !!subscriptions[0].p256dh,
          hasAuth: !!subscriptions[0].auth,
          endpointPrefix: subscriptions[0].endpoint?.substring(0, 50)
        });
      }

      if (!subscriptions || !Array.isArray(subscriptions) || subscriptions.length === 0) {
        return res.status(400).json({ error: "No subscriptions provided" });
      }

      if (!payload?.title) {
        return res.status(400).json({ error: "Payload with title is required" });
      }

      console.log(`Processing ${subscriptions.length} Apple push subscriptions`);

      // Prepare the notification payload
      const notificationPayload = JSON.stringify({
        title: payload.title,
        body: payload.body || "",
        url: payload.url || "/",
        tag: payload.tag || "default",
      });

      // Send to all subscriptions
      const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
          try {
            const pushSubscription = {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            };

            await webpush.sendNotification(pushSubscription, notificationPayload);
            console.log(`Push sent to ${sub.endpoint.substring(0, 50)}...`);
            return { success: true, endpoint: sub.endpoint };
          } catch (error) {
            console.error(`Failed to send to ${sub.endpoint.substring(0, 50)}:`, error.message);
            
            // Return info about expired/invalid subscriptions
            if (error.statusCode === 410 || error.statusCode === 404) {
              return { 
                success: false, 
                endpoint: sub.endpoint, 
                expired: true,
                error: error.message 
              };
            }
            
            return { 
              success: false, 
              endpoint: sub.endpoint, 
              error: error.message 
            };
          }
        })
      );

      // Count results
      const sent = results.filter(r => r.status === "fulfilled" && r.value.success).length;
      const failed = results.length - sent;
      const expired = results.filter(
        r => r.status === "fulfilled" && r.value.expired
      ).map(r => r.value.endpoint);

      console.log(`Push complete: ${sent} sent, ${failed} failed, ${expired.length} expired`);

      return res.json({
        success: true,
        sent,
        failed,
        expiredEndpoints: expired,
      });

    } catch (error) {
      console.error("Error in sendApplePush:", error);
      return res.status(500).json({ 
        error: error.message || "Internal server error" 
      });
    }
  });
});

/**
 * Send push notification via FCM Admin SDK (for Android/Desktop)
 * 
 * Expected request body:
 * {
 *   tokens: ["fcm-token-1", "fcm-token-2"],
 *   payload: {
 *     title: "Notification Title",
 *     body: "Notification body text",
 *     url: "/path/to/open",
 *     tag: "notification-tag"
 *   },
 *   authSecret: "shared-secret-for-verification"
 * }
 */
exports.sendFcm = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      console.log("=== sendFcm request received ===");
      
      // Verify auth secret
      const expectedSecret = getConfigValue("auth.secret", "AUTH_SECRET");
      
      if (expectedSecret && req.body.authSecret !== expectedSecret) {
        console.error("Auth secret mismatch");
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { tokens, payload } = req.body;

      if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
        return res.status(400).json({ error: "No tokens provided" });
      }

      if (!payload?.title) {
        return res.status(400).json({ error: "Payload with title is required" });
      }

      console.log(`Processing ${tokens.length} FCM tokens`);

      // Build the FCM message
      const message = {
        notification: {
          title: payload.title,
          body: payload.body || "",
        },
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body || "",
            icon: "/pwa-192x192.png",
            badge: "/notification-badge.png",
            tag: payload.tag || "default",
            renotify: true,
            vibrate: [100, 50, 100],
          },
          fcmOptions: {
            link: payload.url || "/",
          },
        },
        data: {
          title: payload.title,
          body: payload.body || "",
          url: payload.url || "/",
          tag: payload.tag || "default",
        },
      };

      // Send to all tokens
      const results = await Promise.allSettled(
        tokens.map(async (token) => {
          try {
            await admin.messaging().send({
              ...message,
              token,
            });
            console.log(`FCM sent to ${token.substring(0, 20)}...`);
            return { success: true, token };
          } catch (error) {
            console.error(`Failed to send to ${token.substring(0, 20)}:`, error.code, error.message);
            
            // Check for invalid/expired tokens
            const invalidCodes = [
              "messaging/invalid-registration-token",
              "messaging/registration-token-not-registered",
            ];
            
            return {
              success: false,
              token,
              expired: invalidCodes.includes(error.code),
              error: error.message,
            };
          }
        })
      );

      const sent = results.filter(r => r.status === "fulfilled" && r.value.success).length;
      const failed = results.length - sent;
      const expiredTokens = results
        .filter(r => r.status === "fulfilled" && r.value.expired)
        .map(r => r.value.token);

      console.log(`FCM complete: ${sent} sent, ${failed} failed, ${expiredTokens.length} expired`);

      return res.json({
        success: true,
        sent,
        failed,
        expiredTokens,
      });

    } catch (error) {
      console.error("Error in sendFcm:", error);
      return res.status(500).json({
        error: error.message || "Internal server error",
      });
    }
  });
});

/**
 * Health check endpoint
 */
exports.health = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    res.json({ 
      status: "ok", 
      service: "push-notification-functions",
      functions: ["sendApplePush", "sendFcm", "health"],
      timestamp: new Date().toISOString()
    });
  });
});
