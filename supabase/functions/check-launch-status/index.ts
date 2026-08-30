import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { launchId } = await req.json();
    if (!launchId) {
      return new Response(JSON.stringify({ error: "launchId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch launch
    const { data: launch, error: launchError } = await supabase
      .from("ad_launches")
      .select("id, status, total_ads, ads_created, error_message, completed_at, created_at")
      .eq("id", launchId)
      .single();

    if (launchError || !launch) {
      return new Response(
        JSON.stringify({ error: "Launch not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Count item statuses and collect failed item details
    const { data: items } = await supabase
      .from("ad_launch_items")
      .select("id, meta_status, error_message, video_id, ad_name, videos(unique_video_id, title)")
      .eq("launch_id", launchId);

    const counts = {
      pending: 0,
      active: 0,
      error: 0,
    };

    const failedItems: Array<{
      video_id: string;
      unique_video_id: string;
      title: string;
      ad_name: string | null;
      error_message: string | null;
    }> = [];

    for (const item of items || []) {
      const s = item.meta_status || "pending";
      if (s === "active") counts.active++;
      else if (s === "error") {
        counts.error++;
        const video = (item as any).videos;
        failedItems.push({
          video_id: item.video_id,
          unique_video_id: video?.unique_video_id || "Unknown",
          title: video?.title || "Unknown",
          ad_name: item.ad_name,
          error_message: item.error_message,
        });
      }
      else counts.pending++;
    }

    return new Response(
      JSON.stringify({
        ...launch,
        items: counts,
        failed_items: failedItems,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
