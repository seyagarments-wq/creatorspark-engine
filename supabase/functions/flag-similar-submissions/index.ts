// flag-similar-submissions: flags videos where the same creator submitted within 6h
// with similar title/duration. Just a yellow chip; never auto-rejects.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const { video_id } = await req.json().catch(() => ({}));
  if (!video_id) return new Response(JSON.stringify({ error: "video_id required" }), { status: 400, headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: video } = await supabase
    .from("videos")
    .select("id, creator_id, title, created_at")
    .eq("id", video_id)
    .single();

  if (!video) return new Response(JSON.stringify({ flagged: false }), { headers: corsHeaders });

  const sixHoursAgo = new Date(new Date(video.created_at).getTime() - 6 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("videos")
    .select("id, title, created_at")
    .eq("creator_id", video.creator_id)
    .neq("id", video.id)
    .gte("created_at", sixHoursAgo)
    .lte("created_at", video.created_at);

  const reasons: string[] = [];
  if (recent && recent.length >= 2) reasons.push(`${recent.length + 1} uploads in 6h window`);
  const titleNorm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
  const myTitle = titleNorm(video.title);
  const dup = (recent ?? []).find((r) => myTitle && titleNorm(r.title) === myTitle);
  if (dup) reasons.push("near-identical title to recent submission");

  if (reasons.length) {
    await supabase
      .from("videos")
      .update({ similarity_flag: true, similarity_reason: reasons.join("; ") })
      .eq("id", video.id);
  }

  return new Response(JSON.stringify({ flagged: reasons.length > 0, reasons }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
