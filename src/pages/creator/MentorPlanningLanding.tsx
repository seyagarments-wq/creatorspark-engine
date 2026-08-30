import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAvatarUrl } from "@/lib/storage";
import { ClipboardList, Loader2, ArrowRight } from "lucide-react";

interface AssignedCreator {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export default function MentorPlanningLanding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [creators, setCreators] = useState<AssignedCreator[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) return setLoading(false);

      const { data: assignments } = await supabase
        .from("mentor_creator_assignments")
        .select("creator_id")
        .eq("mentor_id", profile.id)
        .eq("status", "active");

      if (!assignments?.length) return setLoading(false);

      const creatorIds = assignments.map((a) => a.creator_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", creatorIds);

      setCreators(profiles ?? []);
      setLoading(false);
    })();
  }, [user]);

  if (loading) {
    return (
      <CreatorLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <ClipboardList className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Planning Hub</h1>
            <p className="text-sm text-muted-foreground">Choose a creator to open their workspace</p>
          </div>
        </div>

        {creators.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            No active mentees assigned yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {creators.map((c) => (
              <Card
                key={c.id}
                className="group cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => navigate(`/creator/mentees/${c.id}/plan`)}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <Avatar className="h-10 w-10">
                    {c.avatar_url && <AvatarImage src={getAvatarUrl(c.avatar_url) || undefined} />}
                    <AvatarFallback className="bg-primary/10 text-sm font-medium">
                      {c.full_name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{c.full_name}</p>
                    <p className="text-xs text-muted-foreground">Open workspace</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </CreatorLayout>
  );
}
