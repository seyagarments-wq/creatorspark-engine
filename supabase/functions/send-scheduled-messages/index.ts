import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all due scheduled messages
    const { data: dueMessages, error: fetchError } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("sent", false)
      .lte("scheduled_at", new Date().toISOString());

    if (fetchError) throw fetchError;

    if (!dueMessages || dueMessages.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;

    for (const msg of dueMessages) {
      const messageData: any = {
        sender_id: msg.sender_id,
        content: msg.content,
      };

      if (msg.image_url) messageData.image_url = msg.image_url;
      if (msg.chat_id) messageData.chat_id = msg.chat_id;
      if (msg.dm_id) messageData.dm_id = msg.dm_id;

      const { error: insertError } = await supabase
        .from("messages")
        .insert(messageData);

      if (insertError) {
        console.error(`Failed to insert message ${msg.id}:`, insertError);
        continue;
      }

      // Mark as sent
      await supabase
        .from("scheduled_messages")
        .update({ sent: true, sent_at: new Date().toISOString() })
        .eq("id", msg.id);

      processed++;
    }

    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing scheduled messages:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
