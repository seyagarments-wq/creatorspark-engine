import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  user_id: string;
  title: string;
  message: string;
  notification_type: "video" | "payout" | "bounty" | "general";
  link?: string;
  button_text?: string;
  from_name?: string;
}

function getEmailHtml(message: string, link?: string, buttonText?: string, recipientName?: string): string {
  const greeting = recipientName
    ? `<p style="color:#1f2937;font-size:16px;margin:0 0 16px 0;font-weight:500;">Hey ${recipientName},</p>`
    : "";

  const paragraphs = message
    .split("\n")
    .filter((line) => line.trim())
    .map(
      (line) =>
        `<p style="color:#4b5563;font-size:16px;margin:0 0 12px 0;line-height:1.6;">${line}</p>`
    )
    .join("");

  const ctaText = buttonText || "View Details";
  const buttonHtml = link
    ? `<div style="text-align:center;margin:28px 0 12px 0;">
        <a href="${link}" style="display:inline-block;background-color:#8B5CF6;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">${ctaText}</a>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f4f4f5;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:16px;padding:36px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="text-align:center;margin-bottom:28px;">
      <span style="display:inline-block;background:linear-gradient(135deg,#8B5CF6,#7C3AED);color:white;padding:10px 20px;border-radius:10px;font-weight:700;font-size:18px;letter-spacing:-0.3px;">Creatorsctrl</span>
    </div>
    ${greeting}
    ${paragraphs}
    ${buttonHtml}
    <div style="margin-top:36px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="color:#a1a1aa;font-size:12px;margin:0;">Creatorsctrl &bull; Manage preferences in your profile settings</p>
    </div>
  </div>
</body>
</html>`;
}

function getNotificationTypePreference(type: string): string {
  switch (type) {
    case "video":
      return "notify_video_updates";
    case "payout":
      return "notify_payout_updates";
    case "bounty":
      return "notify_bounty_updates";
    default:
      return "email_notifications";
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, title, message, notification_type, link, button_text, from_name }: NotificationRequest = await req.json();

    console.log(`Processing notification for user ${user_id}: ${title}`);

    const appUrl = Deno.env.get("APP_URL") || "https://creatorsctrl.com";
    const fullLink = link
      ? (link.startsWith("http://") || link.startsWith("https://") ? link : `${appUrl}${link}`)
      : undefined;

    // Create in-app notification
    const { data: notification, error: notificationError } = await supabase
      .from("notifications")
      .insert({ user_id, title, message, notification_type, link, email_sent: false })
      .select()
      .single();

    if (notificationError) {
      console.error("Error creating notification:", notificationError);
      throw new Error(`Failed to create notification: ${notificationError.message}`);
    }

    // Send push notification
    try {
      const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({
          userId: user_id,
          payload: { title, body: message, url: link || "/", tag: notification_type },
        }),
      });
      if (pushResponse.ok) {
        console.log("Push notification sent");
      }
    } catch (pushError) {
      console.error("Push notification error:", pushError);
    }

    // Get user profile for email preferences
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, full_name, email_notifications, notify_video_updates, notify_payout_updates, notify_bounty_updates")
      .eq("user_id", user_id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: true, notification_id: notification.id, email_sent: false, reason: "Profile not found" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!profile.email_notifications) {
      return new Response(
        JSON.stringify({ success: true, notification_id: notification.id, email_sent: false, reason: "Email notifications disabled" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const preferenceKey = getNotificationTypePreference(notification_type);
    const typePreference = profile[preferenceKey as keyof typeof profile];
    if (typePreference === false) {
      return new Response(
        JSON.stringify({ success: true, notification_id: notification.id, email_sent: false, reason: `${notification_type} notifications disabled` }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!profile.email) {
      return new Response(
        JSON.stringify({ success: true, notification_id: notification.id, email_sent: false, reason: "No email address" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send email via Resend
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: `${from_name || "Creatorsctrl"} <noreply@seyagarments.com>`,
        to: [profile.email],
        subject: title,
        html: getEmailHtml(message, fullLink, button_text, profile.full_name),
      }),
    });

    const emailResult = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend API error:", emailResult);
      return new Response(
        JSON.stringify({ success: true, notification_id: notification.id, email_sent: false, reason: emailResult.message || "Email send failed" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    await supabase.from("notifications").update({ email_sent: true }).eq("id", notification.id);

    return new Response(
      JSON.stringify({ success: true, notification_id: notification.id, email_sent: true, email_id: emailResult.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-notification-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
