import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface SendPushRequest {
  userId?: string;
  userIds?: string[];
  broadcast?: boolean;
  payload: PushPayload;
}

interface PushSubscriptionRecord {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function logStep(step: string, details?: Record<string, unknown>) {
  console.log(`[send-push-notification] ${step}`, details ? JSON.stringify(details) : "");
}

// Send FCM via Firebase Cloud Function (Admin SDK)
async function sendFcmViaCloudFunction(
  tokens: string[],
  payload: PushPayload,
  functionUrl: string,
  authSecret: string,
  supabase: any,
  subscriptionIds: string[]
): Promise<{ sent: number; failed: number }> {
  try {
    logStep("Sending FCM via Cloud Function", { count: tokens.length });

    const requestBody = {
      tokens,
      payload,
      authSecret,
    };

    logStep("FCM request body", {
      tokenCount: tokens.length,
      hasPayload: !!payload,
      payloadTitle: payload.title,
    });

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logStep("FCM Cloud Function error", { status: response.status, error: errorText });
      return { sent: 0, failed: tokens.length };
    }

    const result = await response.json();
    logStep("FCM Cloud Function result", result);

    // Clean up expired tokens
    if (result.expiredTokens && result.expiredTokens.length > 0) {
      logStep("Cleaning up expired FCM tokens", { count: result.expiredTokens.length });
      for (const token of result.expiredTokens) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", token);
      }
    }

    return { sent: result.sent || 0, failed: result.failed || 0 };
  } catch (error) {
    const err = error as Error;
    logStep("FCM Cloud Function call failed", { error: err.message });
    return { sent: 0, failed: tokens.length };
  }
}

// Send Apple push notifications via Firebase Cloud Function
async function sendApplePushViaCloudFunction(
  subscriptions: PushSubscriptionRecord[],
  payload: PushPayload,
  functionUrl: string,
  authSecret: string,
  supabase: any
): Promise<{ sent: number; failed: number }> {
  try {
    logStep("Sending Apple push via Cloud Function", { 
      count: subscriptions.length,
      functionUrl: functionUrl.substring(0, 60) + "..."
    });

    const requestBody = {
      subscriptions: subscriptions.map(sub => ({
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
      })),
      payload,
      authSecret,
    };

    // Log request shape for debugging
    logStep("Apple push request body shape", {
      subscriptionsCount: requestBody.subscriptions.length,
      hasAuthSecret: !!requestBody.authSecret,
      authSecretLength: requestBody.authSecret?.length,
      payloadKeys: Object.keys(requestBody.payload),
      firstSubShape: requestBody.subscriptions[0] ? {
        hasEndpoint: !!requestBody.subscriptions[0].endpoint,
        hasP256dh: !!requestBody.subscriptions[0].p256dh,
        hasAuth: !!requestBody.subscriptions[0].auth,
        endpointPrefix: requestBody.subscriptions[0].endpoint?.substring(0, 40),
      } : null,
    });

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    logStep("Apple push response", { 
      status: response.status, 
      ok: response.ok,
      responsePreview: responseText.substring(0, 200)
    });

    if (!response.ok) {
      logStep("Apple Cloud Function error", { status: response.status, error: responseText });
      return { sent: 0, failed: subscriptions.length };
    }

    const result = JSON.parse(responseText);
    logStep("Apple Cloud Function result", result);

    // Clean up expired subscriptions
    if (result.expiredEndpoints && result.expiredEndpoints.length > 0) {
      logStep("Cleaning up expired Apple subscriptions", { count: result.expiredEndpoints.length });
      for (const endpoint of result.expiredEndpoints) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
      }
    }

    return { 
      sent: result.sent || 0, 
      failed: result.failed || 0 
    };
  } catch (error) {
    const err = error as Error;
    logStep("Apple Cloud Function call failed", { error: err.message, stack: err.stack });
    return { sent: 0, failed: subscriptions.length };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const applePushFunctionUrl = Deno.env.get("APPLE_PUSH_FUNCTION_URL");
    const applePushAuthSecret = Deno.env.get("APPLE_PUSH_AUTH_SECRET");
    
    // FCM now uses same Firebase project - just different endpoint
    const fcmFunctionUrl = applePushFunctionUrl?.replace("/sendApplePush", "/sendFcm");

    logStep("Environment check", {
      hasAppleUrl: !!applePushFunctionUrl,
      hasAppleSecret: !!applePushAuthSecret,
      hasFcmUrl: !!fcmFunctionUrl,
    });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { userId, userIds, broadcast, payload }: SendPushRequest = await req.json();

    logStep("Request received", { userId, userIdsCount: userIds?.length, broadcast, payload });

    if (!payload?.title) {
      return new Response(
        JSON.stringify({ error: "Payload with title is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let query = supabase.from("push_subscriptions").select("*");

    if (broadcast) {
      // No filter - send to all
    } else if (userIds && userIds.length > 0) {
      query = query.in("user_id", userIds);
    } else if (userId) {
      query = query.eq("user_id", userId);
    } else {
      return new Response(
        JSON.stringify({ error: "Must specify userId, userIds, or broadcast" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: subscriptions, error: fetchError } = await query;

    if (fetchError) {
      console.error("Error fetching subscriptions:", fetchError);
      throw fetchError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No subscriptions found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Processing subscriptions", { count: subscriptions.length });

    // Separate subscriptions by type
    const fcmSubscriptions: PushSubscriptionRecord[] = [];
    const appleSubscriptions: PushSubscriptionRecord[] = [];

    for (const sub of subscriptions as PushSubscriptionRecord[]) {
      const isFCM = sub.p256dh === "fcm" && sub.auth === "fcm";
      const isApple = sub.endpoint.startsWith("https://web.push.apple.com/");

      if (isFCM) {
        fcmSubscriptions.push(sub);
      } else if (isApple) {
        appleSubscriptions.push(sub);
      } else {
        // Other Web Push endpoints - treat as Apple-style (needs VAPID encryption)
        appleSubscriptions.push(sub);
      }
    }

    logStep("Subscription breakdown", { 
      fcm: fcmSubscriptions.length, 
      apple: appleSubscriptions.length 
    });

    let totalSent = 0;
    let totalFailed = 0;

    // Process FCM subscriptions via Cloud Function
    if (fcmSubscriptions.length > 0) {
      if (fcmFunctionUrl && applePushAuthSecret) {
        const tokens = fcmSubscriptions.map(sub => sub.endpoint);
        const subscriptionIds = fcmSubscriptions.map(sub => sub.id);
        
        const fcmResult = await sendFcmViaCloudFunction(
          tokens,
          payload,
          fcmFunctionUrl,
          applePushAuthSecret,
          supabase,
          subscriptionIds
        );
        
        totalSent += fcmResult.sent;
        totalFailed += fcmResult.failed;
        logStep("FCM results", fcmResult);
      } else {
        logStep("FCM not configured", { 
          hasFcmUrl: !!fcmFunctionUrl, 
          hasSecret: !!applePushAuthSecret,
          count: fcmSubscriptions.length 
        });
        totalFailed += fcmSubscriptions.length;
      }
    }

    // Process Apple subscriptions via Cloud Function
    if (appleSubscriptions.length > 0) {
      if (applePushFunctionUrl && applePushAuthSecret) {
        const appleResult = await sendApplePushViaCloudFunction(
          appleSubscriptions,
          payload,
          applePushFunctionUrl,
          applePushAuthSecret,
          supabase
        );
        totalSent += appleResult.sent;
        totalFailed += appleResult.failed;
        
        logStep("Apple push results", appleResult);
      } else {
        logStep("Apple push not configured", { 
          hasUrl: !!applePushFunctionUrl, 
          hasSecret: !!applePushAuthSecret,
          count: appleSubscriptions.length 
        });
        totalFailed += appleSubscriptions.length;
      }
    }

    logStep("Push complete", { sent: totalSent, failed: totalFailed, total: subscriptions.length });

    return new Response(
      JSON.stringify({ success: true, sent: totalSent, failed: totalFailed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-push-notification:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
