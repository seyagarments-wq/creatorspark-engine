import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BulkExportRequest {
  videoIds: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { videoIds }: BulkExportRequest = await req.json();

    if (!videoIds || videoIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "videoIds array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting bulk export for ${videoIds.length} videos`);

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
    const accountId = ad_account_id.replace("act_", "");

    // Fetch videos to export
    const { data: videos, error: videosError } = await supabase
      .from("videos")
      .select(`
        *,
        profiles:creator_id(
          id,
          full_name,
          user_id,
          social_handles,
          instagram_username,
          instagram_business_account_id,
          partnership_ads_enabled
        )
      `)
      .in("id", videoIds)
      .eq("status", "approved");

    if (videosError || !videos) {
      console.error("Error fetching videos:", videosError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch videos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter out already uploaded videos
    const toExport = videos.filter(v => 
      !v.meta_status || v.meta_status === "not_uploaded" || v.meta_status === "error"
    );

    console.log(`Found ${toExport.length} videos eligible for export`);

    const results: {
      videoId: string;
      title: string;
      success: boolean;
      meta_video_id?: string;
      error?: string;
    }[] = [];

    // Process each video with a small delay to avoid rate limits
    for (const video of toExport) {
      try {
        // Mark as uploading
        await supabase
          .from("videos")
          .update({ meta_status: "uploading", meta_error_reason: null })
          .eq("id", video.id);

        if (!video.video_url) {
          throw new Error("Video file URL not found");
        }

        // Build full URL
        let videoFileUrl = video.video_url;
        if (!videoFileUrl.startsWith("http://") && !videoFileUrl.startsWith("https://")) {
          videoFileUrl = `${supabaseUrl}/storage/v1/object/public/videos/${videoFileUrl}`;
        }

        console.log(`Uploading ${video.unique_video_id}...`);

        // Upload to Meta
        const uploadUrl = `https://graph.facebook.com/v19.0/act_${accountId}/advideos`;
        const uploadFormData = new FormData();
        uploadFormData.append("access_token", access_token);
        uploadFormData.append("file_url", videoFileUrl);
        uploadFormData.append("name", video.unique_video_id);
        uploadFormData.append("title", video.title);
        if (video.description) {
          uploadFormData.append("description", video.description);
        }

        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          body: uploadFormData,
        });

        const uploadData = await uploadResponse.json();

        if (uploadData.error) {
          const errorMessage =
            uploadData.error?.error_user_msg ||
            uploadData.error?.error_user_title ||
            uploadData.error?.message ||
            "Failed to upload";
          throw new Error(errorMessage);
        }

        const metaVideoId = uploadData.id;
        console.log(`Video ${video.unique_video_id} uploaded with Meta ID: ${metaVideoId}`);

        // Create Ad Creative if page_id is configured
        let metaCreativeId = null;
        const creatorProfile = video.profiles as any;
        const instagramBusinessAccountId = creatorProfile?.instagram_business_account_id;
        const instagramUsername = creatorProfile?.instagram_username || creatorProfile?.social_handles?.instagram;
        const isVerifiedConnection = Boolean(creatorProfile?.partnership_ads_enabled && instagramBusinessAccountId);

        if (page_id) {
          const videoData: Record<string, any> = {
            video_id: metaVideoId,
            title: video.title,
            message: video.description || "",
            call_to_action: {
              type: "LEARN_MORE",
              value: { link: default_link || "https://example.com" },
            },
          };

          if (isVerifiedConnection && instagramBusinessAccountId) {
            videoData.branded_content_sponsor_id = page_id;
            if (instagramUsername) {
              videoData.message = `${video.description || ""}\n\nCreated by @${instagramUsername}`;
            }
          } else if (instagramUsername) {
            videoData.message = `${video.description || ""}\n\nCreated by @${instagramUsername}`;
          }

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
          if (creativeData.id) {
            metaCreativeId = creativeData.id;
          }
        }

        // Update video record
        await supabase
          .from("videos")
          .update({
            meta_video_id: metaVideoId,
            meta_creative_id: metaCreativeId,
            meta_status: "uploaded",
            meta_uploaded_at: new Date().toISOString(),
            meta_error_reason: null,
          })
          .eq("id", video.id);

        // Notify creator
        if (creatorProfile?.user_id) {
          await supabase.from("notifications").insert({
            user_id: creatorProfile.user_id,
            title: "Video Exported to Meta",
            message: `Your video "${video.title}" has been uploaded to Meta Ads.`,
            link: "/creator/videos",
          });
        }

        results.push({
          videoId: video.id,
          title: video.title,
          success: true,
          meta_video_id: metaVideoId,
        });

        // Small delay between uploads to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`Failed to export ${video.unique_video_id}:`, errorMessage);

        await supabase
          .from("videos")
          .update({ meta_status: "error", meta_error_reason: errorMessage })
          .eq("id", video.id);

        results.push({
          videoId: video.id,
          title: video.title,
          success: false,
          error: errorMessage,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`Bulk export complete: ${successCount} success, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        total: toExport.length,
        exported: successCount,
        failed: failCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in bulk-export-meta:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
