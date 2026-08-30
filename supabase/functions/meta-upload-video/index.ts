import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UploadRequest {
  videoId: string;
  retry?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get request body
    const { videoId, retry }: UploadRequest = await req.json();

    if (!videoId) {
      return new Response(
        JSON.stringify({ error: "videoId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch Meta credentials
    const { data: credentials, error: credError } = await supabase
      .from("meta_credentials")
      .select("*")
      .eq("status", "connected")
      .limit(1)
      .single();

    if (credError || !credentials) {
      console.error("No Meta credentials found:", credError);
      return new Response(
        JSON.stringify({ error: "Meta Ads not connected. Please connect in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token, ad_account_id, page_id, default_link } = credentials;

    // Fetch video details with creator profile including Instagram OAuth data
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select(`
        *,
        profiles!videos_creator_id_fkey(
          id,
          full_name,
          user_id,
          social_handles,
          commission_percentage,
          instagram_user_id,
          instagram_username,
          instagram_business_account_id,
          partnership_ads_enabled
        )
      `)
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      console.error("Video not found:", videoError);
      return new Response(
        JSON.stringify({ error: "Video not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (video.status !== "approved") {
      return new Response(
        JSON.stringify({ error: "Only approved videos can be exported to Meta" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already uploaded (unless retry)
    if (!retry && video.meta_status === "uploaded") {
      return new Response(
        JSON.stringify({ error: "Video already uploaded to Meta", meta_video_id: video.meta_video_id }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to uploading and clear any previous errors
    await supabase
      .from("videos")
      .update({ meta_status: "uploading", meta_error_reason: null })
      .eq("id", videoId);

    console.log(`Starting Meta upload for video: ${video.unique_video_id}`);

    // Get the video file URL from storage
    if (!video.video_url) {
      await supabase
        .from("videos")
        .update({ meta_status: "error", meta_error_reason: "Video file URL not found" })
        .eq("id", videoId);
      
      return new Response(
        JSON.stringify({ error: "Video file URL not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert relative path to full public URL if needed
    let videoFileUrl = video.video_url;
    if (!videoFileUrl.startsWith("http://") && !videoFileUrl.startsWith("https://")) {
      // Build the full public URL for Supabase storage
      videoFileUrl = `${supabaseUrl}/storage/v1/object/public/videos/${videoFileUrl}`;
    }
    console.log(`Full video URL for Meta: ${videoFileUrl}`);

    // Extract creator's Instagram info - prefer OAuth-verified data
    const creatorProfile = video.profiles as {
      id: string;
      full_name: string;
      user_id: string;
      social_handles: { instagram?: string } | null;
      commission_percentage: number;
      instagram_user_id: string | null;
      instagram_username: string | null;
      instagram_business_account_id: string | null;
      partnership_ads_enabled: boolean;
    } | null;

    // Use verified Instagram Business Account ID if available, fallback to handle
    const instagramBusinessAccountId = creatorProfile?.instagram_business_account_id;
    const instagramUsername = creatorProfile?.instagram_username || creatorProfile?.social_handles?.instagram;
    const isVerifiedConnection = Boolean(creatorProfile?.partnership_ads_enabled && instagramBusinessAccountId);
    
    console.log(`Creator: ${creatorProfile?.full_name}, Instagram: @${instagramUsername || "not set"}, Verified: ${isVerifiedConnection}`);

    // Step 1: Upload video to Meta Ads
    const accountId = ad_account_id.replace("act_", "");
    const uploadUrl = `https://graph.facebook.com/v19.0/act_${accountId}/advideos`;
    
    const uploadFormData = new FormData();
    uploadFormData.append("access_token", access_token);
    uploadFormData.append("file_url", videoFileUrl);
    uploadFormData.append("name", video.unique_video_id);
    uploadFormData.append("title", video.title);
    if (video.description) {
      uploadFormData.append("description", video.description);
    }

    console.log(`Uploading video to Meta: ${videoFileUrl}`);

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      body: uploadFormData,
    });

    const uploadData = await uploadResponse.json();
    console.log("Meta upload response:", uploadData);

    if (uploadData.error) {
      // Prefer Meta's user-facing message/title when available.
      const metaErr = uploadData.error as {
        message?: string;
        error_user_title?: string;
        error_user_msg?: string;
        error_subcode?: number;
        code?: number;
        type?: string;
        fbtrace_id?: string;
      };

      const errorMessage =
        metaErr?.error_user_msg ||
        metaErr?.error_user_title ||
        metaErr?.message ||
        "Failed to upload video to Meta";
      console.error("Meta upload error:", uploadData.error);
      
      await supabase
        .from("videos")
        .update({ meta_status: "error", meta_error_reason: errorMessage })
        .eq("id", videoId);

      return new Response(
        JSON.stringify({
          error: errorMessage,
          meta_error: metaErr,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const metaVideoId = uploadData.id;
    console.log(`Video uploaded to Meta with ID: ${metaVideoId}`);

    // Step 2: Create Ad Creative using the uploaded video (if page_id is configured)
    let metaCreativeId = null;
    let partnershipAdsEnabled = false;

    if (page_id) {
      console.log(`Creating Ad Creative with Page ID: ${page_id}`);

      // Build video_data object for the creative
      const videoData: Record<string, any> = {
        video_id: metaVideoId,
        title: video.title,
        message: video.description || "",
        call_to_action: {
          type: "LEARN_MORE",
          value: { link: default_link || "https://example.com" },
        },
      };

      // If creator has verified Instagram connection, use proper Partnership Ads
      if (isVerifiedConnection && instagramBusinessAccountId) {
        console.log(`Using verified Partnership Ads with IG Business Account: ${instagramBusinessAccountId}`);
        
        // For proper Partnership Ads, we use the branded_content_sponsor_id
        // The brand's Page ID is the sponsor, and the creator's IG account is the creator
        videoData.branded_content_sponsor_id = page_id;
        
        // Note: Full Partnership Ads also requires the creator to have granted
        // branded_content_ads_brand permission through the Instagram app
        // The creator's Instagram username is added for attribution
        if (instagramUsername) {
          videoData.message = `${video.description || ""}\n\nCreated by @${instagramUsername}`;
        }
        partnershipAdsEnabled = true;
        console.log(`Partnership Ads enabled with verified creator @${instagramUsername}`);
      } else if (instagramUsername) {
        // Fallback: Just add handle to caption (not real Partnership Ads)
        console.log(`Using caption attribution for @${instagramUsername} (not verified)`);
        videoData.message = `${video.description || ""}\n\nCreated by @${instagramUsername}`;
        // Note: partnershipAdsEnabled stays false since this isn't real Partnership Ads
      }

      // Create the creative
      const creativeUrl = `https://graph.facebook.com/v19.0/act_${accountId}/adcreatives`;
      const creativeBody = new URLSearchParams({
        access_token,
        name: `Creative_${video.unique_video_id}`,
        object_story_spec: JSON.stringify({
          page_id: page_id,
          video_data: videoData,
        }),
      });

      const creativeResponse = await fetch(creativeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: creativeBody,
      });

      const creativeData = await creativeResponse.json();
      console.log("Creative creation response:", creativeData);

      if (creativeData.id) {
        metaCreativeId = creativeData.id;
        console.log(`Creative created with ID: ${metaCreativeId}`);
      } else if (creativeData.error) {
        console.warn("Creative creation failed (video still uploaded):", creativeData.error);
      }
    } else {
      console.log("Page ID not configured, skipping creative creation");
    }

    // Step 3: Update video record with Meta IDs
    const { error: updateError } = await supabase
      .from("videos")
      .update({
        meta_video_id: metaVideoId,
        meta_creative_id: metaCreativeId,
        meta_status: "uploaded",
        meta_uploaded_at: new Date().toISOString(),
        meta_error_reason: null,
      })
      .eq("id", videoId);

    if (updateError) {
      console.error("Error updating video record:", updateError);
    }

    // Create a notification for the creator
    if (creatorProfile) {
      await supabase.from("notifications").insert({
        user_id: creatorProfile.user_id,
        title: "Video Exported to Meta",
        message: `Your video "${video.title}" has been uploaded to Meta Ads${partnershipAdsEnabled ? " with creator attribution" : ""} and is ready for campaigns.`,
        link: "/creator/videos",
      });
    }

    console.log(`Successfully uploaded video ${video.unique_video_id} to Meta`);

    return new Response(
      JSON.stringify({
        success: true,
        meta_video_id: metaVideoId,
        meta_creative_id: metaCreativeId,
        partnership_ads: partnershipAdsEnabled,
        message: "Video uploaded to Meta successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in meta-upload-video:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
