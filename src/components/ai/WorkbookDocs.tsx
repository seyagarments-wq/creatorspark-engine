import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { NotebookPen, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Doc = {
  id: string;
  title: string;
  doc_type: string;
  content: string;
  updated_at: string;
};

const TYPES = ["script", "hook", "brief", "note"];

export function WorkbookDocs() {
  const { toast } = useToast();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [active, setActive] = useState<Doc | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("ai_workbook_docs")
      .select("id, title, doc_type, content, updated_at")
      .order("updated_at", { ascending: false });
    setDocs((data as Doc[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data, error } = await supabase
      .from("ai_workbook_docs")
      .insert({ user_id: auth.user.id, title: "Untitled", doc_type: "note", content: "" })
      .select("id, title, doc_type, content, updated_at")
      .single();
    if (error) return toast({ title: "Could not create", description: error.message, variant: "destructive" });
    setDocs((p) => [data as Doc, ...p]);
    setActive(data as Doc);
  };

  const save = async () => {
    if (!active) return;
    setSaving(true);
    const { error } = await supabase
      .from("ai_workbook_docs")
      .update({ title: active.title, doc_type: active.doc_type, content: active.content })
      .eq("id", active.id);
    setSaving(false);
    if (error) return toast({ title: "Could not save", description: error.message, variant: "destructive" });
    toast({ title: "Saved" });
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("ai_workbook_docs").delete().eq("id", id);
    setDocs((p) => p.filter((d) => d.id !== id));
    if (active?.id === id) setActive(null);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading workbook…
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <Card className="p-3 h-fit">
        <Button onClick={create} size="sm" className="w-full mb-3">
          <Plus className="w-4 h-4 mr-1" /> New entry
        </Button>
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {docs.length === 0 && (
            <p className="text-sm text-muted-foreground px-2 py-4">No entries yet.</p>
          )}
          {docs.map((d) => (
            <button
              key={d.id}
              onClick={() => setActive(d)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-xl transition-colors",
                active?.id === d.id ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              <p className="text-sm font-medium truncate">{d.title || "Untitled"}</p>
              <p className="text-xs text-muted-foreground capitalize">{d.doc_type}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        {!active ? (
          <div className="text-center py-16 text-muted-foreground">
            <NotebookPen className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Select or create an entry to start writing.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              value={active.title}
              onChange={(e) => setActive({ ...active, title: e.target.value })}
              placeholder="Title"
              className="text-base font-semibold"
            />
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button key={t} onClick={() => setActive({ ...active, doc_type: t })}>
                  <Badge variant={active.doc_type === t ? "default" : "secondary"} className="capitalize cursor-pointer">
                    {t}
                  </Badge>
                </button>
              ))}
            </div>
            <Textarea
              value={active.content}
              onChange={(e) => setActive({ ...active, content: e.target.value })}
              placeholder="Write your script, hook list, brief or notes here…"
              className="min-h-[320px] rounded-2xl"
            />
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving} size="sm">
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Save
              </Button>
              <Button onClick={() => remove(active.id)} variant="outline" size="sm" className="text-destructive">
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
