# Firebase Cloud Functions for Push Notifications

Two Cloud Functions handle push notifications:
1. **sendApplePush** - Apple/Safari Web Push (VAPID encryption via `web-push`)
2. **sendFcm** - Android/Desktop via Firebase Admin SDK (FCM v1 API)

## Prerequisites

1. **Firebase Project** with Blaze (pay-as-you-go) plan
2. **Firebase CLI** installed: `npm install -g firebase-tools`
3. **VAPID Keys** (for Apple push)

## Setup Instructions

### 1. Create/Use Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project or use existing one
3. Upgrade to **Blaze plan** (required for Cloud Functions)

### 2. Initialize Firebase Functions

```bash
# Login to Firebase
firebase login

# Initialize in a new directory
mkdir firebase-push-service
cd firebase-push-service
firebase init functions

# Choose:
# - JavaScript
# - ESLint: No (optional)
# - Install dependencies: Yes
```

### 3. Copy Function Code

Copy the contents of this folder to your `functions/` directory:
- `index.js` → `functions/index.js`
- Update `functions/package.json` with the dependencies from `package.json`

### 4. Configure Environment Variables

```bash
# Set VAPID keys (for Apple push)
firebase functions:config:set vapid.public="YOUR_VAPID_PUBLIC_KEY"
firebase functions:config:set vapid.private="YOUR_VAPID_PRIVATE_KEY"
firebase functions:config:set vapid.subject="mailto:contact@seyagarments.com"

# Set shared auth secret
firebase functions:config:set auth.secret="YOUR_RANDOM_SECRET_HERE"
```

### 5. Deploy

```bash
firebase deploy --only functions
```

After deployment, you'll get URLs like:
```
✔ Function URL (sendApplePush): https://us-central1-YOUR-PROJECT.cloudfunctions.net/sendApplePush
✔ Function URL (sendFcm): https://us-central1-YOUR-PROJECT.cloudfunctions.net/sendFcm
✔ Function URL (health): https://us-central1-YOUR-PROJECT.cloudfunctions.net/health
```

### 6. Add URL to Supabase Secrets

Add these secrets to your Supabase project:

| Secret Name | Value |
|-------------|-------|
| `APPLE_PUSH_FUNCTION_URL` | `https://us-central1-YOUR-PROJECT.cloudfunctions.net/sendApplePush` |
| `APPLE_PUSH_AUTH_SECRET` | Same value you set for `auth.secret` above |

The Supabase edge function automatically derives the FCM URL from the Apple URL.

## API Reference

### sendApplePush

```bash
curl -X POST https://YOUR-URL/sendApplePush \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptions": [{
      "endpoint": "https://web.push.apple.com/...",
      "p256dh": "...",
      "auth": "..."
    }],
    "payload": {
      "title": "Test",
      "body": "Hello from Firebase!",
      "url": "/",
      "tag": "test"
    },
    "authSecret": "YOUR_AUTH_SECRET"
  }'
```

### sendFcm

```bash
curl -X POST https://YOUR-URL/sendFcm \
  -H "Content-Type: application/json" \
  -d '{
    "tokens": ["fcm-token-1", "fcm-token-2"],
    "payload": {
      "title": "Test",
      "body": "Hello from FCM!",
      "url": "/",
      "tag": "test"
    },
    "authSecret": "YOUR_AUTH_SECRET"
  }'
```

### health

```bash
curl https://YOUR-URL/health
# Returns: {"status":"ok","service":"push-notification-functions","functions":["sendApplePush","sendFcm","health"]}
```

## Cost Estimate

Firebase Cloud Functions pricing:
- **Free tier**: 2M invocations/month, 400K GB-seconds
- **Beyond free tier**: ~$0.40 per million invocations

For most apps, push notifications will stay well within the free tier.

## Troubleshooting

### "VAPID keys not configured"
Run the `firebase functions:config:set` commands and redeploy.

### "Unauthorized" error
Check that `authSecret` in the request matches the `auth.secret` config.

### Push not received on iOS
1. Ensure the PWA is installed to Home Screen
2. Check that notification permissions are granted
3. Verify the subscription is valid (not expired)

### FCM token errors
The function automatically reports expired tokens. The Supabase edge function cleans them up from the database.

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐
│ Supabase Edge Func  │────▶│ Firebase Cloud Functions │
│ send-push-notif     │     ├──────────────────────────┤
└─────────────────────┘     │ sendFcm (Admin SDK)      │
                            │ sendApplePush (web-push) │
                            └──────────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
       ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
       │ FCM v1 API  │         │ Apple Push  │         │ Mozilla     │
       │ (Android)   │         │ Service     │         │ Push        │
       └─────────────┘         └─────────────┘         └─────────────┘
```
