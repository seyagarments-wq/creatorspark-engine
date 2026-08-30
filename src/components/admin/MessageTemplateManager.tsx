import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_CATEGORIES = ["approval", "feedback", "rejection", "general"];

interface Template {
  id: string;
  title: string;
  content: string;
  category: string;
}

interface MessageTemplateManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MessageTemplateManager({ open, onOpenChange }: MessageTemplateManagerProps) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open]);

  async function fetchTemplates() {
    setLoading(true);
    const { data } = await supabase
      .from("message_templates")
      .select("id, title, content, category")
      .order("category")
      .order("title");
    setTemplates((data as Template[]) || []);
    setLoading(false);
  }

  function resetForm() {
    setTitle("");
    setContent("");
    setCategory("general");
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(t: Template) {
    setTitle(t.title);
    setContent(t.content);
    setCategory(t.category);
    setEditingId(t.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) {
      toast.error("Title and content are required");
      return;
    }

    if (editingId) {
      const { error } = await supabase
        .from("message_templates")
        .update({ title: title.trim(), content: content.trim(), category } as any)
        .eq("id", editingId);
      if (error) {
        toast.error("Failed to update template");
        return;
      }
      toast.success("Template updated");
    } else {
      const { error } = await supabase
        .from("message_templates")
        .insert({
          title: title.trim(),
          content: content.trim(),
          category,
          created_by: user?.id,
        } as any);
      if (error) {
        toast.error("Failed to create template");
        return;
      }
      toast.success("Template created");
    }
    resetForm();
    fetchTemplates();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("message_templates").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete template");
      return;
    }
    toast.success("Template deleted");
    fetchTemplates();
  }

  const categoryColors: Record<string, string> = {
    approval: "bg-green-500/10 text-green-600",
    feedback: "bg-blue-500/10 text-blue-600",
    rejection: "bg-red-500/10 text-red-600",
    general: "bg-muted text-muted-foreground",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Message Templates</DialogTitle>
        </DialogHeader>

        {showForm ? (
          <div className="space-y-3">
            <Input
              placeholder="Template title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              placeholder="Message content..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
            />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleSave}>
                <Save className="w-4 h-4 mr-1" /> {editingId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowForm(true)}
          >
            <Plus className="w-4 h-4 mr-1" /> New Template
          </Button>
        )}

        <ScrollArea className="max-h-72 mt-2">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No templates yet.</p>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="border rounded-lg p-3 flex items-start justify-between gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <Badge
                        variant="secondary"
                        className={`text-xs capitalize shrink-0 ${categoryColors[t.category] || categoryColors.general}`}
                      >
                        {t.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.content}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => startEdit(t)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(t.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
