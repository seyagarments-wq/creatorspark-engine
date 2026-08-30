import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, UserPlus, X, Loader2 } from "lucide-react";

interface MentorCreatorAssignmentProps {
  creatorId: string;
  creatorName: string;
}

interface MentorOption {
  id: string;
  full_name: string;
}

interface ActiveAssignment {
  id: string;
  mentor_id: string;
  mentor_name: string;
  notes: string | null;
  created_at: string;
}

export function MentorCreatorAssignment({ creatorId, creatorName }: MentorCreatorAssignmentProps) {
  const { toast } = useToast();
  const [mentors, setMentors] = useState<MentorOption[]>([]);
  const [activeAssignments, setActiveAssignments] = useState<ActiveAssignment[]>([]);
  const [selectedMentor, setSelectedMentor] = useState("");
  const [notes, setNotes] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [creatorId]);

  async function fetchData() {
    try {
      // Fetch mentors
      const { data: mentorProfiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_mentor", true)
        .neq("id", creatorId);

      setMentors(mentorProfiles || []);

      // Fetch active assignments for this creator
      const { data: assignments } = await supabase
        .from("mentor_creator_assignments")
        .select("id, mentor_id, notes, created_at")
        .eq("creator_id", creatorId)
        .eq("status", "active");

      if (assignments && assignments.length > 0) {
        const mentorIds = assignments.map(a => a.mentor_id);
        const { data: mentorNames } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", mentorIds);

        const nameMap = new Map(mentorNames?.map(m => [m.id, m.full_name]) || []);
        setActiveAssignments(assignments.map(a => ({
          ...a,
          mentor_name: nameMap.get(a.mentor_id) || "Unknown",
        })));
      } else {
        setActiveAssignments([]);
      }
    } catch (err) {
      console.error("Error fetching mentor data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign() {
    if (!selectedMentor) return;
    setAssigning(true);

    try {
      const { error } = await supabase
        .from("mentor_creator_assignments")
        .insert({
          mentor_id: selectedMentor,
          creator_id: creatorId,
          assigned_by: (await supabase.auth.getUser()).data.user?.id || "",
          notes: notes.trim() || null,
        });

      if (error) {
        if (error.code === "23505") {
          toast({ title: "Already assigned", description: "This mentor is already assigned to this creator.", variant: "destructive" });
        } else {
          throw error;
        }
      } else {
        // Fire-and-forget: notify both mentor and creator via email
        supabase.functions.invoke("notify-mentor-creator-assignment", {
          body: { mentor_id: selectedMentor, creator_id: creatorId },
        }).catch(e => console.error("Failed to send mentor-creator assignment notification:", e));

        toast({ title: "Creator assigned! 🛡️", description: `${creatorName} has been assigned to a mentor for review.` });
        setSelectedMentor("");
        setNotes("");
        fetchData();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  }

  async function handleRemove(assignmentId: string) {
    const { error } = await supabase
      .from("mentor_creator_assignments")
      .update({ status: "removed", updated_at: new Date().toISOString() })
      .eq("id", assignmentId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Assignment removed" });
      fetchData();
    }
  }

  if (loading) return null;

  // Filter out already-assigned mentors
  const availableMentors = mentors.filter(m => !activeAssignments.some(a => a.mentor_id === m.id));

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-3">
          <UserPlus className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-medium">Assign to Mentor</p>
            <p className="text-xs text-muted-foreground">
              Mentor will see all of {creatorName}'s videos in their Content Review tab
            </p>
          </div>
        </div>

        {/* Active assignments */}
        {activeAssignments.length > 0 && (
          <div className="space-y-2">
            {activeAssignments.map(a => (
              <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-muted">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{a.mentor_name}</span>
                  <Badge variant="outline" className="text-[10px]">Active</Badge>
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleRemove(a.id)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Assign new */}
        {availableMentors.length > 0 && (
          <div className="space-y-3">
            <Select value={selectedMentor} onValueChange={setSelectedMentor}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a mentor..." />
              </SelectTrigger>
              <SelectContent>
                {availableMentors.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Optional notes for the mentor..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="min-h-[60px] text-sm"
            />
            <Button onClick={handleAssign} disabled={!selectedMentor || assigning} size="sm">
              {assigning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
              Assign Creator
            </Button>
          </div>
        )}

        {availableMentors.length === 0 && activeAssignments.length === 0 && (
          <p className="text-xs text-muted-foreground">No mentors available. Promote a creator to mentor first.</p>
        )}
      </CardContent>
    </Card>
  );
}
