import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyChatRequest {
  message_id: string;
  sender_id: string;
  chat_id?: string;
  dm_id?: string;
  content: string;
  sender_name?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { message_id, sender_id, chat_id, dm_id, content, sender_name }: NotifyChatRequest = await req.json();

    console.log(`notify-chat-message: sender=${sender_id}, chat=${chat_id}, dm=${dm_id}`);

    let recipientUserIds: string[] = [];
    let chatName = "Chat";
    let notifLink = "/creator/chat";
    let adminLink = "/admin/chat";

    if (chat_id) {
      // Group chat — fetch all members except sender
      const { data: members } = await supabase
        .from("group_chat_members")
        .select("user_id")
        .eq("chat_id", chat_id)
        .neq("user_id", sender_id);

      recipientUserIds = (members || []).map((m) => m.user_id);

      // Get chat name
      const { data: chat } = await supabase
        .from("group_chats")
        .select("name")
        .eq("id", chat_id)
        .single();
      chatName = chat?.name || "Group Chat";
    } else if (dm_id) {
      // DM — notify the other participant
      const { data: dm } = await supabase
        .from("direct_messages")
        .select("participant1_id, participant2_id")
        .eq("id", dm_id)
        .single();

      if (dm) {
        const otherId = dm.participant1_id === sender_id ? dm.participant2_id : dm.participant1_id;
        recipientUserIds = [otherId];
      }
      chatName = "Direct Message";
    }

    if (recipientUserIds.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Determine if sender is admin to set correct link direction
    const { data: senderRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sender_id)
      .single();
    const senderIsAdmin = senderRole?.role === "admin";

    const previewText = content.length > 80 ? content.slice(0, 80) + "…" : content;
    const title = sender_name ? `New message from ${sender_name}` : "New message";
    const message = sender_name
      ? `${sender_name} sent you a message:\n\n"${previewText}"\n\nOpen the app to view and reply.`
      : `"${previewText}"\n\nOpen the app to view and reply.`;

    let notified = 0;
    for (const recipientUserId of recipientUserIds) {
      try {
        // Check if recipient is admin to determine the right link
        const { data: recipientRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", recipientUserId)
          .single();
        const link = recipientRole?.role === "admin" ? adminLink : notifLink;

        await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            user_id: recipientUserId,
            title,
            message,
            notification_type: "general",
            link,
          }),
        });
        notified++;
      } catch (err) {
        console.error(`Failed to notify ${recipientUserId}:`, err);
      }
    }

    return new Response(JSON.stringify({ success: true, notified }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in notify-chat-message:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
