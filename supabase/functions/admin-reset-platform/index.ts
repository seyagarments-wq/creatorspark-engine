import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify admin role from the JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Unauthorized - Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "reset_creators") {
      // Reset all gamification data
      const { error: gamErr } = await supabase
        .from("creator_gamification")
        .update({
          total_xp: 0,
          current_level: 1,
          current_streak: 0,
          longest_streak: 0,
          weekly_challenge_progress: 0,
          weekly_challenge_completed: false,
          last_activity_date: null,
        })
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (gamErr) {
        console.error("Gamification reset error:", gamErr);
        throw gamErr;
      }

      // Delete challenge completions
      const { error: compErr } = await supabase
        .from("creator_challenge_completions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (compErr) {
        console.error("Challenge completions delete error:", compErr);
        throw compErr;
      }

      // Delete payouts
      const { error: payErr } = await supabase
        .from("payouts")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (payErr) {
        console.error("Payouts delete error:", payErr);
        throw payErr;
      }

      // Delete creator bounties
      const { error: bountyErr } = await supabase
        .from("creator_bounties")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (bountyErr) {
        console.error("Creator bounties delete error:", bountyErr);
        throw bountyErr;
      }

      console.log("All creator stats reset successfully");
      return new Response(JSON.stringify({ success: true, message: "All creator stats reset" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "reset_all") {
      // Combined reset: reset creators AND delete all videos
      console.log("Starting full platform reset...");

      // 1. Get all videos first
      const { data: videos, error: fetchErr } = await supabase
        .from("videos")
        .select("id, video_url, thumbnail_url");

      if (fetchErr) {
        console.error("Fetch videos error:", fetchErr);
        throw fetchErr;
      }

      // 2. Delete performance data
      if (videos && videos.length > 0) {
        const { error: perfErr } = await supabase
          .from("performance_data")
          .delete()
          .in("video_id", videos.map((v) => v.id));

        if (perfErr) console.error("Performance data delete error:", perfErr);

        // Update messages referencing videos
        await supabase
          .from("messages")
          .update({ highlighted_video_id: null })
          .in("highlighted_video_id", videos.map((v) => v.id));

        // Update creator bounties referencing videos
        await supabase
          .from("creator_bounties")
          .update({ video_id: null })
          .in("video_id", videos.map((v) => v.id));
      }

      // 3. Delete all video records
      const { error: vidErr } = await supabase
        .from("videos")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (vidErr) {
        console.error("Videos delete error:", vidErr);
        throw vidErr;
      }

      // 4. Delete video files from storage
      if (videos && videos.length > 0) {
        const videoPaths: string[] = [];
        const thumbPaths: string[] = [];

        videos.forEach((v) => {
          if (v.video_url) {
            const match = v.video_url.match(/\/videos\/(.+)$/);
            if (match) videoPaths.push(match[1]);
          }
          if (v.thumbnail_url) {
            const match = v.thumbnail_url.match(/\/videos\/(.+)$/);
            if (match) thumbPaths.push(match[1]);
          }
        });

        if (videoPaths.length > 0) {
          const { error: storageErr } = await supabase.storage
            .from("videos")
            .remove(videoPaths);
          console.log("Video storage delete:", storageErr || "success");
        }

        if (thumbPaths.length > 0) {
          const { error: thumbErr } = await supabase.storage
            .from("videos")
            .remove(thumbPaths);
          console.log("Thumbnail storage delete:", thumbErr || "success");
        }
      }

      // 5. Reset all gamification data
      const { error: gamErr } = await supabase
        .from("creator_gamification")
        .update({
          total_xp: 0,
          current_level: 1,
          current_streak: 0,
          longest_streak: 0,
          weekly_challenge_progress: 0,
          weekly_challenge_completed: false,
          last_activity_date: null,
        })
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (gamErr) console.error("Gamification reset error:", gamErr);

      // 6. Delete challenge completions
      await supabase
        .from("creator_challenge_completions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      // 7. Delete payouts
      await supabase
        .from("payouts")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      // 8. Delete creator bounties
      await supabase
        .from("creator_bounties")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      console.log("Full platform reset completed successfully");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Platform reset complete. Deleted ${videos?.length || 0} videos and reset all creator stats.` 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "delete_videos") {
      // Get all videos first
      const { data: videos, error: fetchErr } = await supabase
        .from("videos")
        .select("id, video_url, thumbnail_url");

      if (fetchErr) throw fetchErr;

      // Delete performance data
      if (videos && videos.length > 0) {
        const { error: perfErr } = await supabase
          .from("performance_data")
          .delete()
          .in("video_id", videos.map((v) => v.id));

        if (perfErr) throw perfErr;

        // Delete messages referencing videos
        const { error: msgErr } = await supabase
          .from("messages")
          .update({ highlighted_video_id: null })
          .in("highlighted_video_id", videos.map((v) => v.id));

        // Ignore message update errors (optional reference)
        console.log("Message update result:", msgErr);

        // Delete creator bounties referencing videos
        const { error: cbErr } = await supabase
          .from("creator_bounties")
          .update({ video_id: null })
          .in("video_id", videos.map((v) => v.id));

        console.log("Creator bounties update result:", cbErr);
      }

      // Delete all video records
      const { error: vidErr } = await supabase
        .from("videos")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (vidErr) throw vidErr;

      // Delete video files from storage
      if (videos && videos.length > 0) {
        const videoPaths: string[] = [];
        const thumbPaths: string[] = [];

        videos.forEach((v) => {
          if (v.video_url) {
            // Extract path from URL
            const match = v.video_url.match(/\/videos\/(.+)$/);
            if (match) videoPaths.push(match[1]);
          }
          if (v.thumbnail_url) {
            const match = v.thumbnail_url.match(/\/videos\/(.+)$/);
            if (match) thumbPaths.push(match[1]);
          }
        });

        if (videoPaths.length > 0) {
          const { error: storageErr } = await supabase.storage
            .from("videos")
            .remove(videoPaths);
          console.log("Video storage delete result:", storageErr);
        }

        if (thumbPaths.length > 0) {
          const { error: thumbErr } = await supabase.storage
            .from("videos")
            .remove(thumbPaths);
          console.log("Thumbnail storage delete result:", thumbErr);
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: `Deleted ${videos?.length || 0} videos` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (action === "delete_creator") {
      const creator_id = body.creator_id;
      
      if (!creator_id) {
        return new Response(JSON.stringify({ error: "Missing creator_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Deleting creator:", creator_id);

      // Get creator's profile to find user_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("id", creator_id)
        .maybeSingle();

      if (!profile) {
        return new Response(JSON.stringify({ error: "Creator not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get creator's video IDs
      const { data: videos } = await supabase
        .from("videos")
        .select("id, video_url, thumbnail_url")
        .eq("creator_id", creator_id);

      const videoIds = videos?.map((v) => v.id) || [];

      // Delete performance data for creator's videos
      if (videoIds.length > 0) {
        await supabase.from("performance_data").delete().in("video_id", videoIds);
        await supabase.from("messages").update({ highlighted_video_id: null }).in("highlighted_video_id", videoIds);
        await supabase.from("meta_ad_mappings").delete().in("video_id", videoIds);
      }

      // Delete creator bounties
      await supabase.from("creator_bounties").delete().eq("creator_id", creator_id);

      // Delete challenge completions
      await supabase.from("creator_challenge_completions").delete().eq("creator_id", creator_id);

      // Delete payouts
      await supabase.from("payouts").delete().eq("creator_id", creator_id);

      // Delete gamification
      await supabase.from("creator_gamification").delete().eq("creator_id", creator_id);

      // Delete creator brands
      await supabase.from("creator_brands").delete().eq("creator_id", creator_id);

      // Delete sample requests
      await supabase.from("sample_requests").delete().eq("creator_id", creator_id);

      // Delete partnership permissions
      await supabase.from("partnership_permissions").delete().eq("creator_id", creator_id);

      // Delete videos
      if (videoIds.length > 0) {
        await supabase.from("videos").delete().in("id", videoIds);

        // Delete video files from storage
        const paths: string[] = [];
        videos?.forEach((v) => {
          if (v.video_url) {
            const match = v.video_url.match(/\/videos\/(.+)$/);
            if (match) paths.push(match[1]);
          }
          if (v.thumbnail_url) {
            const match = v.thumbnail_url.match(/\/videos\/(.+)$/);
            if (match) paths.push(match[1]);
          }
        });
        if (paths.length > 0) {
          await supabase.storage.from("videos").remove(paths);
        }
      }

      // Delete DMs involving this user
      await supabase.from("direct_messages").delete()
        .or(`participant1_id.eq.${profile.user_id},participant2_id.eq.${profile.user_id}`);

      // Delete push subscriptions
      await supabase.from("push_subscriptions").delete().eq("user_id", profile.user_id);

      // Delete notifications
      await supabase.from("notifications").delete().eq("user_id", profile.user_id);

      // Delete group chat memberships
      await supabase.from("group_chat_members").delete().eq("user_id", profile.user_id);

      // Delete user role
      await supabase.from("user_roles").delete().eq("user_id", profile.user_id);

      // Delete profile
      await supabase.from("profiles").delete().eq("id", creator_id);

      // Delete the auth user
      const { error: authDeleteErr } = await supabase.auth.admin.deleteUser(profile.user_id);
      if (authDeleteErr) {
        console.error("Auth user delete error (non-fatal):", authDeleteErr);
      }

      console.log("Creator deleted successfully:", creator_id);
      return new Response(
        JSON.stringify({ success: true, message: "Creator permanently deleted" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (action === "delete_payouts") {
      const { payout_ids } = body;

      if (!payout_ids || !Array.isArray(payout_ids) || payout_ids.length === 0) {
        return new Response(JSON.stringify({ error: "Missing or empty payout_ids array" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Deleting payouts:", payout_ids);

      const { error: delErr, count } = await supabase
        .from("payouts")
        .delete()
        .in("id", payout_ids);

      if (delErr) {
        console.error("Payout delete error:", delErr);
        throw delErr;
      }

      console.log("Deleted payouts count:", count);
      return new Response(
        JSON.stringify({ success: true, message: `Deleted ${payout_ids.length} payout(s)` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (action === "clear_performance_data") {
      const { error: perfErr } = await supabase
        .from("performance_data")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (perfErr) {
        console.error("Performance data clear error:", perfErr);
        throw perfErr;
      }

      console.log("All performance data cleared");
      return new Response(
        JSON.stringify({ success: true, message: "All performance data cleared" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Admin reset error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
