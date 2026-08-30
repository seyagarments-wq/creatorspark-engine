import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getSecret } from "../_shared/secrets.ts";

const RESEND_API_KEY = (await getSecret("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteEmailRequest {
  email: string;
  brand_name: string;
  invite_link: string;
  invited_by_name?: string;
}

function getInviteEmailHtml(inviteLink: string, brandName: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#f4f4f5;margin:0;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:36px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <div style="text-align:center;margin-bottom:28px;">
    <span style="display:inline-block;background:linear-gradient(135deg,#8B5CF6,#7C3AED);color:white;padding:10px 20px;border-radius:10px;font-weight:700;font-size:18px;">Creatorsctrl</span>
  </div>
  <p style="color:#1f2937;font-size:16px;margin:0 0 16px 0;font-weight:500;">Hello,</p>
  <p style="color:#4b5563;font-size:16px;margin:0 0 12px 0;line-height:1.6;">You have been invited to join ${brandName} on Creatorsctrl, our platform for managing content submissions, performance, and payouts.</p>
  <p style="color:#4b5563;font-size:16px;margin:0 0 12px 0;line-height:1.6;">To accept the invitation and set up your account, click the button below.</p>
  <div style="text-align:center;margin:28px 0 12px 0;">
    <a href="${inviteLink}" style="display:inline-block;background-color:#8B5CF6;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">Accept invitation</a>
  </div>
  <div style="background-color:#f3f4f6;padding:12px;border-radius:8px;margin:20px 0;">
    <p style="color:#6b7280;font-size:12px;word-break:break-all;margin:0;text-align:center;">${inviteLink}</p>
  </div>
  <div style="margin-top:36px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="color:#a1a1aa;font-size:12px;margin:0;">This invitation expires in 7 days. If you were not expecting this email, you can safely ignore it.</p>
  </div>
</div></body></html>`;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) throw new Error("Email service not configured");

    const { email, brand_name, invite_link }: InviteEmailRequest = await req.json();
    if (!email || !brand_name || !invite_link) throw new Error("Missing required fields");

    console.log(`Sending invite email to ${email}`);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "Creatorsctrl <noreply@seyagarments.com>",
        to: [email],
        subject: `[Action Required] Your invitation to ${brand_name} on Creatorsctrl`,
        html: getInviteEmailHtml(invite_link, brand_name),
      }),
    });

    const emailResult = await emailResponse.json();
    if (!emailResponse.ok) throw new Error(emailResult.message || "Failed to send email");

    return new Response(
      JSON.stringify({ success: true, email_id: emailResult.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-invite-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
