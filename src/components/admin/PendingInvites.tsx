import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Trash2, Clock, Mail } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Invite {
  id: string;
  email: string;
  token: string;
  expires_at: string;
  created_at: string;
  used_at: string | null;
}

export default function PendingInvites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchInvites();
  }, []);

  async function fetchInvites() {
    try {
      const { data, error } = await supabase
        .from("invites")
        .select("*")
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInvites(data || []);
    } catch (error) {
      console.error("Error fetching invites:", error);
    } finally {
      setLoading(false);
    }
  }

  function copyLink(invite: Invite) {
    const link = `${window.location.origin}/auth?invite=${invite.token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({
      title: "Copied!",
      description: "Invite link copied to clipboard",
    });
  }

  async function deleteInvite(id: string) {
    try {
      const { error } = await supabase.from("invites").delete().eq("id", id);
      if (error) throw error;
      setInvites((prev) => prev.filter((i) => i.id !== id));
      toast({
        title: "Invite deleted",
        description: "The invite has been revoked",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (invites.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No pending invites</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg"
        >
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{invite.email}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              <Clock className="w-3 h-3" />
              <span>
                Expires{" "}
                {formatDistanceToNow(new Date(invite.expires_at), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyLink(invite)}
            >
              {copiedId === invite.id ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => deleteInvite(invite.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
