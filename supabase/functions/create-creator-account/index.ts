import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, full_name, instagram_handle, referrer_id, application_id } = await req.json();

    if (!email || !full_name) {
      throw new Error("Email and full_name are required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate a random temporary password
    const tempPassword = crypto.randomUUID() + "Aa1!";

    // Create the auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm so they can reset password
      user_metadata: { full_name },
    });

    if (authError) {
      throw new Error(`Failed to create auth user: ${authError.message}`);
    }

    const userId = authUser.user.id;
    console.log("Created auth user:", userId);

    // Create profile
    const { error: profileError } = await supabase.from("profiles").insert({
      user_id: userId,
      email,
      full_name,
      status: "active",
      social_handles: instagram_handle ? { instagram: instagram_handle } : {},
    });

    if (profileError) {
      console.error("Profile creation error:", profileError);
      // Don't throw - user is created, profile can be fixed
    }

    // Assign creator role
    const { error: roleError } = await supabase.from("user_roles").insert({
      user_id: userId,
      role: "creator",
    });

    if (roleError) {
      console.error("Role assignment error:", roleError);
    }

    // Update referral if exists
    if (referrer_id) {
      // Check if referral record exists
      const { data: existingReferral } = await supabase
        .from("referrals")
        .select("id")
        .eq("referee_email", email)
        .maybeSingle();

      if (existingReferral) {
        // Get the new profile id
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", userId)
          .single();

        if (profile) {
          await supabase
            .from("referrals")
            .update({ referee_id: profile.id, status: "completed" })
            .eq("id", existingReferral.id);
        }
      }
    }

    // Generate password reset link so user can set their own password
    const origin = req.headers.get("origin") || "https://creatorsctrl.com";
    const { data: resetData, error: resetError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${origin}/reset-password`,
      },
    });

    if (resetError) {
      console.error("Reset link error:", resetError);
    }

    // Send welcome onboarding email
    if (resendApiKey) {
      const resend = new Resend(resendApiKey);

      await resend.emails.send({
        from: "Creatorsctrl <noreply@seyagarments.com>",
        to: [email],
        subject: "🎉 You've been approved — Welcome to Creatorsctrl!",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px;">
            <h2 style="color:#111;">HEY ${full_name}! 👋</h2>
            <p style="color:#444;">Congrats again on being approved to join <strong>Creatorsctrl</strong>! We're excited to have you.</p>
            <p style="color:#444;">To start earning, you'll need to complete a few quick steps:</p>
            <ol style="color:#444; line-height:1.8;">
              <li><strong>Create your account</strong> — Sign in at <a href="https://creatorsctrl.com/auth" style="color:#6366f1;">creatorsctrl.com</a></li>
              <li><strong>Connect Stripe</strong> — So we can send you payouts</li>
              <li><strong>Request your free sample</strong> — Get the product shipped to you</li>
              <li><strong>Submit your first video</strong> — Start earning commissions!</li>
            </ol>
            <p style="margin-top:24px;">
              <a href="https://creatorsctrl.com/auth" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">Get Started Now</a>
            </p>
            <p style="color:#888;font-size:13px;margin-top:32px;">Questions? Text our founder Kohl directly at <strong>(425) 588-1480</strong> — he's happy to help!</p>
          </div>
        `,
      });

      console.log("Welcome onboarding email sent to:", email);
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId, message: "Creator account created and welcome email sent." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Error creating creator account:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
