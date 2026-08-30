import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { submissionId, retry } = await req.json();

    if (!submissionId) {
      return new Response(
        JSON.stringify({ error: "submissionId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: credentials, error: credError } = await supabase
      .from("meta_credentials")
      .select("*")
      .eq("status", "connected")
      .limit(1)
      .single();

    if (credError || !credentials) {
      return new Response(
        JSON.stringify({ error: "Meta Ads not connected. Please connect in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token, ad_account_id } = credentials;
    const accountId = ad_account_id.replace("act_", "");

    const { data: submission, error: subError } = await supabase
      .from("photo_submissions")
      .select("*, profiles:creator_id(id, full_name, user_id)")
      .eq("id", submissionId)
      .single();

    if (subError || !submission) {
      return new Response(
        JSON.stringify({ error: "Submission not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (submission.status !== "approved") {
      return new Response(
        JSON.stringify({ error: "Only approved submissions can be exported to Meta" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!retry && submission.meta_status === "uploaded") {
      return new Response(
        JSON.stringify({ error: "Already uploaded to Meta" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const photoUrls: string[] = submission.photo_urls || [];
    if (photoUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: "No photos in submission" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("photo_submissions")
      .update({ meta_status: "uploading", meta_error_reason: null } as any)
      .eq("id", submissionId);

    const creatorProfile = submission.profiles as any;
    const creativeName = (submission as any).creative_name || submission.title || "Photo";
    const imageHashes: string[] = [];
    let lastMetaError: string | null = null;

    // Labels for the two slots: index 0 = Story, index 1 = Feed
    const slotLabels = ["Story", "Feed"];

    for (let i = 0; i < photoUrls.length; i++) {
      const photoUrl = photoUrls[i];
      const slotLabel = slotLabels[i] || `Photo_${i + 1}`;

      try {
        let fullUrl = photoUrl;
        if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) {
          fullUrl = `${supabaseUrl}/storage/v1/object/public/photos/${fullUrl}`;
        }

        // Upload image to Meta Ad Account image library
        const imageHashUrl = `https://graph.facebook.com/v19.0/act_${accountId}/adimages`;
        const imageResp = await fetch(imageHashUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            access_token,
            url: fullUrl,
            name: `${creativeName}_${slotLabel}`,
          }),
        });
        const imageData = await imageResp.json();

        if (imageData.error) {
          lastMetaError = imageData.error?.message || "Failed to upload image";
          throw new Error(lastMetaError);
        }

        const images = imageData.images || {};
        const imageInfo = Object.values(images)[0] as any;
        const imageHash = imageInfo?.hash;

        if (!imageHash) {
          throw new Error("No image hash returned from Meta");
        }

        imageHashes.push(imageHash);
        console.log(`Uploaded ${creativeName}_${slotLabel} → hash: ${imageHash}`);

        await new Promise(r => setTimeout(r, 300));
      } catch (photoErr) {
        const errMsg = photoErr instanceof Error ? photoErr.message : String(photoErr);
        if (!lastMetaError) lastMetaError = errMsg;
        console.error(`Error uploading ${slotLabel}:`, photoErr);
      }
    }

    const finalStatus = imageHashes.length > 0 ? "uploaded" : "error";
    const finalError = imageHashes.length === 0 ? (lastMetaError || "No images were uploaded to Meta library") : null;

    await supabase
      .from("photo_submissions")
      .update({
        meta_status: finalStatus,
        meta_creative_ids: imageHashes,
        meta_uploaded_at: new Date().toISOString(),
        meta_error_reason: finalError,
      } as any)
      .eq("id", submissionId);

    if (imageHashes.length === 0) {
      return new Response(
        JSON.stringify({ error: finalError, uploaded: 0 }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (creatorProfile?.user_id) {
      await supabase.from("notifications").insert({
        user_id: creatorProfile.user_id,
        title: "Creative Exported to Meta",
        message: `"${creativeName}" (Story + Feed) uploaded to Meta library.`,
        link: "/creator/photo-submissions",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        image_hashes: imageHashes,
        total_photos: photoUrls.length,
        uploaded: imageHashes.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in meta-upload-photo:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
