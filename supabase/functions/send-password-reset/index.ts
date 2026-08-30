import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { getSecret } from "../_shared/secrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PasswordResetRequest {
  email: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email }: PasswordResetRequest = await req.json();

    if (!email) {
      throw new Error("Email is required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = (await getSecret("RESEND_API_KEY"));

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    // Get the origin from the request headers or use the published URL
    const origin = req.headers.get("origin") || "https://creatorsctrl.com";
    
    // Generate password reset link using Supabase Admin API
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: `${origin}/reset-password`,
      },
    });

    if (error) {
      console.error("Error generating reset link:", error);
      // Don't reveal if email exists or not for security
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset email has been sent." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // The action_link from generateLink is the full Supabase auth URL that handles the token verification
    // and redirects to our app with the session established
    const resetLink = data.properties?.action_link;

    if (!resetLink) {
      throw new Error("Failed to generate reset link");
    }
    
    console.log("Generated reset link for:", email);

    // Send email via Resend using verified domain
    const fromEmail = "Creatorsctrl <noreply@seyagarments.com>";
    
    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: "Reset Your Password - Creatorsctrl",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; padding: 40px 20px;">
            <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
              <div style="text-align: center; margin-bottom: 32px;">
                <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 12px; display: inline-flex; align-items: center; justify-content: center;">
                  <span style="color: white; font-size: 24px;">⚡</span>
                </div>
                <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #18181b;">Reset Your Password</h1>
              </div>
              
              <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                We received a request to reset your password. Click the button below to create a new password:
              </p>
              
              <a href="${resetLink}" style="display: block; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-weight: 600; text-align: center; margin-bottom: 24px;">
                Reset Password
              </a>
              
              <p style="color: #a1a1aa; font-size: 14px; line-height: 1.5; margin-bottom: 16px;">
                This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
              
              <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
                Creatorsctrl - UGC Creator Platform
              </p>
            </div>
          </body>
        </html>
      `,
    });

    if (emailError) {
      console.error("Error sending email:", emailError);
      throw new Error("Failed to send reset email");
    }

    console.log("Password reset email sent successfully to:", email);

    return new Response(
      JSON.stringify({ success: true, message: "If an account exists, a reset email has been sent." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Error in send-password-reset:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
