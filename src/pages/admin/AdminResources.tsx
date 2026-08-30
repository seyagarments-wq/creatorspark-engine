import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, FileText, Video, Link as LinkIcon, FileDown, GraduationCap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Resource {
  id: string;
  title: string;
  description: string | null;
  category: string;
  content_type: string;
  content_url: string | null;
  content_body: string | null;
  thumbnail_url: string | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
}

const CATEGORIES = ["UGC Tips", "Video Concepts", "Best Practices", "Hooks & Scripts", "General"];
const CONTENT_TYPES = [
  { value: "article", label: "Article", icon: FileText },
  { value: "video", label: "Video", icon: Video },
  { value: "link", label: "External Link", icon: LinkIcon },
  { value: "pdf", label: "PDF", icon: FileDown },
];

export default function AdminResources() {
  const { profileId } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [contentType, setContentType] = useState("link");
  const [contentUrl, setContentUrl] = useState("");
  const [contentBody, setContentBody] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchResources();
  }, []);

  async function fetchResources() {
    try {
      const { data, error } = await supabase
        .from("resources")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setResources(data || []);
    } catch (e) {
      console.error("Error fetching resources:", e);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setTitle(""); setDescription(""); setCategory("General");
    setContentType("link"); setContentUrl(""); setContentBody("");
    setIsPublished(true); setEditing(null);
  }

  function openEdit(resource: Resource) {
    setEditing(resource);
    setTitle(resource.title);
    setDescription(resource.description || "");
    setCategory(resource.category);
    setContentType(resource.content_type);
    setContentUrl(resource.content_url || "");
    setContentBody(resource.content_body || "");
    setIsPublished(resource.is_published);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        category,
        content_type: contentType,
        content_url: contentUrl.trim() || null,
        content_body: contentBody.trim() || null,
        is_published: isPublished,
        created_by: profileId,
      };

      if (editing) {
        const { error } = await supabase.from("resources").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Resource updated" });
      } else {
        const { error } = await supabase.from("resources").insert(payload);
        if (error) throw error;
        toast({ title: "Resource created" });
      }
      setDialogOpen(false);
      resetForm();
      fetchResources();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this resource?")) return;
    const { error } = await supabase.from("resources").delete().eq("id", id);
    if (error) {
      toast({ title: "Error deleting", variant: "destructive" });
    } else {
      toast({ title: "Resource deleted" });
      fetchResources();
    }
  }

  const contentTypeIcon = (type: string) => {
    const ct = CONTENT_TYPES.find((c) => c.value === type);
    return ct ? ct.icon : FileText;
  };

  return (
    <AdminLayout>
      <div className="space-y-4 md:space-y-6 animate-fade-in">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg md:text-2xl font-bold">Resources</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Manage educational content for creators</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Resource</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Resource" : "Add Resource"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="How to Hook in 3 Seconds" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A quick guide on..." rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={contentType} onValueChange={setContentType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONTENT_TYPES.map((ct) => <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {(contentType === "link" || contentType === "video" || contentType === "pdf") && (
                  <div>
                    <Label>URL</Label>
                    <Input value={contentUrl} onChange={(e) => setContentUrl(e.target.value)} placeholder="https://..." />
                  </div>
                )}
                {contentType === "article" && (
                  <div>
                    <Label>Article Content</Label>
                    <Textarea value={contentBody} onChange={(e) => setContentBody(e.target.value)} placeholder="Write your article content here..." rows={8} />
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <Label>Published</Label>
                  <Switch checked={isPublished} onCheckedChange={setIsPublished} />
                </div>
                <Button className="w-full" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : editing ? "Update" : "Create"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : resources.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <GraduationCap className="w-12 h-12 mb-3" />
              <p className="font-medium">No resources yet</p>
              <p className="text-sm">Add guides, tips, and videos for your creators.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {resources.map((r) => {
              const Icon = contentTypeIcon(r.content_type);
              return (
                <Card key={r.id}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{r.title}</p>
                        {!r.is_published && <Badge variant="outline" className="text-[10px]">Draft</Badge>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-[10px]">{r.category}</Badge>
                        <span className="text-[10px] text-muted-foreground capitalize">{r.content_type}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
