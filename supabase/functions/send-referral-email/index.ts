import { Resend } from "npm:resend@2.0.0";
import { getSecret } from "../_shared/secrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend((await getSecret("RESEND_API_KEY")));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Require a bearer token to prevent open relay
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { to, subject, html } = await req.json();

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, subject, html" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof to !== "string" || !to.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await resend.emails.send({
      from: "Creators Control <noreply@seyagarments.com>",
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Email sent successfully:", data?.id);
    return new Response(JSON.stringify({ success: true, id: data?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error sending referral email:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Failed to send email" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
