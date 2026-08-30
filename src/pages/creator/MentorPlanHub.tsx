import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { getAvatarUrl } from "@/lib/storage";
import {
  ArrowLeft, FileText, Link2, Video, Loader2, Save, Plus,
  Trash2, ExternalLink, Clock, Camera, Upload, Sparkles,
  PenLine, Play, Image as ImageIcon, MapPin, Film, X,
  Pencil, Copy, ChevronDown, BookmarkPlus, Star, Zap,
  Eye, CheckCircle2, Circle, AlertCircle, Timer,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

/* ───── types ───── */
interface PlanData {
  id: string;
  mentor_id: string;
  creator_id: string;
  script_text: string;
  notes: string;
  video_call_url: string;
  status: string;
  updated_at: string;
}

interface PartnerProfile { full_name: string; avatar_url: string | null; }

interface PlanItem {
  id: string;
  plan_id: string;
  type: string;
  content: string;
  title: string;
  note: string;
  image_url: string | null;
  color: string;
  position_order: number;
  created_by: string;
  created_at: string;
}

const PHOTO_TAGS = [
  { label: "Location", color: "#f97316", icon: MapPin },
  { label: "Set-up", color: "#06b6d4", icon: Camera },
  { label: "Outfit", color: "#a855f7", icon: Sparkles },
  { label: "Prop", color: "#22c55e", icon: ImageIcon },
  { label: "General", color: "#6366f1", icon: ImageIcon },
];

const PRIORITY_BADGES = [
  { label: "Must study", color: "#ef4444", icon: Zap },
  { label: "Nice to have", color: "#f59e0b", icon: Star },
  { label: "Advanced", color: "#8b5cf6", icon: Eye },
];

const SCRIPT_TEMPLATES = [
  { name: "Hook → Problem → Solution → CTA", content: "🪝 HOOK\n[Attention-grabbing opener — 3 seconds max]\n\n❗ PROBLEM\n[What pain point are you solving?]\n\n✅ SOLUTION\n[Show the product solving the problem]\n\n📣 CTA\n[Tell them what to do — shop now, link in bio, etc.]" },
  { name: "Story-time", content: "📖 STORY INTRO\n[Set the scene — \"So this happened to me…\"]\n\n🔄 THE JOURNEY\n[What happened, the struggle, the discovery]\n\n🌟 THE REVEAL\n[Show the product as the hero of the story]\n\n💬 SIGN-OFF\n[Personal recommendation + CTA]" },
  { name: "Get Ready With Me", content: "👋 GRWM INTRO\n[\"Get ready with me while I…\" — casual, relatable opener]\n\n💄 THE ROUTINE\n[Walk through your process, naturally introduce the product]\n\n⭐ PRODUCT SPOTLIGHT\n[Focus moment — why you love it, how it fits your routine]\n\n✨ FINAL LOOK\n[Show the result + call to action]" },
  { name: "Product Review", content: "📦 FIRST IMPRESSIONS\n[Unboxing or first look — genuine reaction]\n\n🔍 DEEP DIVE\n[Features, texture, quality — be specific and honest]\n\n🧪 THE TEST\n[Use it in real life — show results]\n\n⭐ VERDICT\n[Rating, who it's for, final recommendation + CTA]" },
];

/* ═══════════════════════════════════════════════════════ */
export default function MentorPlanHub() {
  const { id: menteeProfileId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [items, setItems] = useState<PlanItem[]>([]);

  const isMentorView = !!menteeProfileId;

  /* ───── load ───── */
  useEffect(() => { if (user) loadPlan(); }, [user, menteeProfileId]);

  async function loadPlan() {
    setLoading(true);
    try {
      const { data: myProfile } = await supabase.from("profiles").select("id").eq("user_id", user!.id).single();
      if (!myProfile) throw new Error("Profile not found");
      setMyProfileId(myProfile.id);

      let mentorId: string, creatorId: string;
      if (isMentorView) { mentorId = myProfile.id; creatorId = menteeProfileId!; }
      else {
        const { data: a } = await supabase.from("mentor_creator_assignments").select("mentor_id").eq("creator_id", myProfile.id).eq("status", "active").limit(1).maybeSingle();
        if (!a) { setLoading(false); return; }
        mentorId = a.mentor_id; creatorId = myProfile.id;
      }

      const partnerId = isMentorView ? creatorId : mentorId;
      const { data: pd } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", partnerId).single();
      if (pd) setPartner(pd);

      let { data: ep } = await supabase.from("mentor_plans").select("*").eq("mentor_id", mentorId).eq("creator_id", creatorId).maybeSingle();
      if (!ep && isMentorView) {
        const { data: np, error } = await supabase.from("mentor_plans").insert({ mentor_id: mentorId, creator_id: creatorId }).select().single();
        if (error) throw error;
        ep = np;
      }
      if (ep) {
        const p = ep as any;
        setPlan(p);
        await loadItems(p.id);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  async function loadItems(planId: string) {
    const { data } = await supabase.from("plan_items").select("*").eq("plan_id", planId).order("position_order");
    setItems((data as any[]) ?? []);
  }

  /* ───── realtime ───── */
  useEffect(() => {
    if (!plan?.id) return;
    const ch = supabase.channel(`plan-${plan.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_items", filter: `plan_id=eq.${plan.id}` }, () => loadItems(plan.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [plan?.id]);

  /* ───── helpers ───── */
  const photoItems = items.filter((i) => i.type === "image");
  const videoItems = items.filter((i) => i.type === "video");
  const scriptItems = items.filter((i) => i.type === "script");
  const scriptNotes = items.filter((i) => i.type === "script_note");

  async function uploadFile(file: File, type: "image" | "video", color = "#6366f1", title = "") {
    if (!plan?.id || !myProfileId) return;
    const path = `${plan.id}/${Date.now()}-${file.name}`;
    const { error: ue } = await supabase.storage.from("plan-uploads").upload(path, file);
    if (ue) { toast({ title: "Upload failed", description: ue.message, variant: "destructive" }); return; }
    const { data: u } = supabase.storage.from("plan-uploads").getPublicUrl(path);
    await supabase.from("plan_items").insert({
      plan_id: plan.id, type, content: u.publicUrl, image_url: type === "image" ? u.publicUrl : null,
      title: title || file.name, color, position_order: items.length, created_by: myProfileId,
    } as any);
  }

  async function addLinkItem(type: "image" | "video", url: string, title: string, note: string, color: string) {
    if (!plan?.id || !myProfileId || !url.trim()) return;
    await supabase.from("plan_items").insert({
      plan_id: plan.id, type, content: url, title, note, color,
      position_order: items.length, created_by: myProfileId,
    } as any);
  }

  async function createScript(title: string, templateContent = "") {
    if (!plan?.id || !myProfileId) return;
    await supabase.from("plan_items").insert({
      plan_id: plan.id, type: "script", title: title || `Script ${scriptItems.length + 1}`,
      content: templateContent, color: "#6366f1", position_order: items.length, created_by: myProfileId,
    } as any);
  }

  async function updateItem(id: string, updates: Partial<PlanItem>) {
    await supabase.from("plan_items").update(updates as any).eq("id", id);
  }

  async function deleteItem(id: string) {
    await supabase.from("plan_items").delete().eq("id", id);
  }

  async function saveMentorNote(scriptId: string, noteContent: string) {
    if (!plan?.id || !myProfileId) return;
    const existing = scriptNotes.find((n) => n.note === scriptId);
    if (existing) {
      await supabase.from("plan_items").update({ content: noteContent } as any).eq("id", existing.id);
    } else {
      await supabase.from("plan_items").insert({
        plan_id: plan.id, type: "script_note", title: "Mentor Notes", content: noteContent,
        note: scriptId, color: "#f59e0b", position_order: items.length, created_by: myProfileId,
      } as any);
    }
  }

  /* ───── render ───── */
  if (loading) return <CreatorLayout><div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></CreatorLayout>;

  if (!plan && !isMentorView) {
    return (
      <CreatorLayout>
        <div className="text-center py-16 space-y-3">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">No Planning Hub Yet</h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">Your mentor hasn't set up a planning workspace yet. Check back soon!</p>
        </div>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout>
      <div className="space-y-4 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(isMentorView ? `/creator/mentees/${menteeProfileId}` : "/creator")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Planning Hub</h1>
              {partner && (
                <div className="flex items-center gap-2 mt-0.5">
                  <Avatar className="h-5 w-5">
                    {partner.avatar_url && <AvatarImage src={getAvatarUrl(partner.avatar_url) || undefined} />}
                    <AvatarFallback className="text-[10px] bg-primary/10">{partner.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground">with <span className="font-medium text-foreground">{partner.full_name}</span></span>
                </div>
              )}
            </div>
          </div>
          {plan?.updated_at && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> {formatDistanceToNow(new Date(plan.updated_at), { addSuffix: true })}
            </span>
          )}
        </div>

        {/* ═══ Tabs — 3 focused tabs ═══ */}
        <Tabs defaultValue="photos" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="photos" className="gap-1.5"><Camera className="w-4 h-4 shrink-0" /> Mood Board</TabsTrigger>
            <TabsTrigger value="videos" className="gap-1.5"><Film className="w-4 h-4 shrink-0" /> Video Refs</TabsTrigger>
            <TabsTrigger value="scripts" className="gap-1.5"><PenLine className="w-4 h-4 shrink-0" /> Scripts</TabsTrigger>
          </TabsList>

          {/* ─── MOOD BOARD ─── */}
          <TabsContent value="photos" className="mt-4 space-y-4">
            {/* Prompt banner */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
              <Camera className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Before you film, share a few photos of your setup so we can make adjustments</p>
                <p className="text-xs text-muted-foreground mt-1">Location, lighting, outfits, props — snap a few photos and tag them below.</p>
              </div>
            </div>

            <PhotoUploader
              onUpload={(f, c) => uploadFile(f, "image", c)}
              onAddLink={(url, title, note, color) => addLinkItem("image", url, title, note, color)}
            />

            {photoItems.length === 0 ? (
              <EmptyState icon={Camera} text="Share photos of your filming location, set-up, outfits, or anything visual." />
            ) : (
              <div className="columns-1 sm:columns-2 lg:columns-3 gap-3 space-y-3">
                {photoItems.map((item) => (
                  <MoodCard key={item.id} item={item} onDelete={() => deleteItem(item.id)} onUpdateNote={(note) => updateItem(item.id, { note } as any)} onToggleChecked={(checked) => updateItem(item.id, { note: checked ? `[x] ${item.note?.replace(/^\[[ x]\]\s*/, '') || ''}` : `[ ] ${item.note?.replace(/^\[[ x]\]\s*/, '') || ''}` } as any)} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── VIDEO REFERENCES ─── */}
          <TabsContent value="videos" className="mt-4 space-y-4">
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 flex items-start gap-3">
              <Film className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Add videos to study — examples of hooks, transitions, product reveals, or styles to emulate</p>
                <p className="text-xs text-muted-foreground mt-1">Paste YouTube, TikTok, or Instagram links. Mark what's important to copy.</p>
              </div>
            </div>

            <VideoUploader
              onUpload={(f) => uploadFile(f, "video", "#f97316")}
              onAddLink={(url, title, note, priority) => addLinkItem("video", url, title, note, priority)}
            />

            {videoItems.length === 0 ? (
              <EmptyState icon={Film} text="Add video references — examples to study, styles to emulate, or past work to improve on." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {videoItems.map((item) => (
                  <VideoRefCard key={item.id} item={item} onDelete={() => deleteItem(item.id)} onUpdateNote={(note) => updateItem(item.id, { note } as any)} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── SCRIPTS ─── */}
          <TabsContent value="scripts" className="mt-4 space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
              <PenLine className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Create multiple scripts — one per concept, angle, or video idea</p>
                <p className="text-xs text-muted-foreground mt-1">Use templates to get started fast. Mentors can leave notes without touching your script.</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={() => createScript("")}>
                <Plus className="w-4 h-4 mr-1" /> Blank Script
              </Button>
              {SCRIPT_TEMPLATES.map((t) => (
                <Button key={t.name} size="sm" variant="outline" onClick={() => createScript(t.name, t.content)} className="text-xs">
                  <Sparkles className="w-3 h-3 mr-1" /> {t.name}
                </Button>
              ))}
            </div>

            {scriptItems.length === 0 ? (
              <EmptyState icon={PenLine} text={'No scripts yet. Pick a template above or start with a blank script.'} />
            ) : (
              <div className="space-y-4">
                {scriptItems.map((s) => (
                  <ScriptCard
                    key={s.id}
                    item={s}
                    mentorNote={scriptNotes.find((n) => n.note === s.id)?.content || ""}
                    isMentorView={isMentorView}
                    onUpdate={(content) => updateItem(s.id, { content } as any)}
                    onDelete={() => deleteItem(s.id)}
                    onSaveMentorNote={(note) => saveMentorNote(s.id, note)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </CreatorLayout>
  );
}

/* ═══════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════ */

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="text-center py-14 text-muted-foreground">
      <Icon className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm max-w-xs mx-auto">{text}</p>
    </div>
  );
}

/* ─── Photo Uploader ─── */
function PhotoUploader({ onUpload, onAddLink }: {
  onUpload: (f: File, color: string) => void;
  onAddLink: (url: string, title: string, note: string, color: string) => void;
}) {
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    files.forEach((f) => onUpload(f, color));
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-2 items-center flex-wrap">
          <Button size="sm" variant={mode === "upload" ? "default" : "outline"} onClick={() => setMode("upload")}>
            <Upload className="w-3 h-3 mr-1" /> Upload Photos
          </Button>
          <Button size="sm" variant={mode === "link" ? "default" : "outline"} onClick={() => setMode("link")}>
            <Link2 className="w-3 h-3 mr-1" /> Paste Link
          </Button>
          <div className="flex-1" />
          <div className="flex gap-1.5 items-center">
            {PHOTO_TAGS.map((t) => {
              const TIcon = t.icon;
              return (
                <button
                  key={t.color}
                  title={t.label}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border transition-all ${color === t.color ? "ring-2 ring-offset-1 ring-foreground/20 scale-105" : "opacity-60 hover:opacity-100"}`}
                  style={{ backgroundColor: t.color + "20", borderColor: t.color, color: t.color }}
                  onClick={() => setColor(t.color)}
                >
                  <TIcon className="w-3 h-3" /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {mode === "upload" ? (
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50"}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <Camera className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Drop photos here or tap to upload</p>
            <p className="text-xs text-muted-foreground mt-1">Share your filming location, set-up, outfits, props — anything visual</p>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { Array.from(e.target.files || []).forEach((f) => onUpload(f, color)); }} />
          </div>
        ) : (
          <div className="space-y-2">
            <Input placeholder="Image URL (Pinterest, Instagram, etc.)" value={url} onChange={(e) => setUrl(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Label" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button size="sm" onClick={() => { onAddLink(url, title, note, color); setUrl(""); setTitle(""); setNote(""); }} disabled={!url.trim()}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Mood Card (with inline notes + checklist toggle) ─── */
function MoodCard({ item, onDelete, onUpdateNote, onToggleChecked }: {
  item: PlanItem; onDelete: () => void;
  onUpdateNote: (note: string) => void;
  onToggleChecked: (checked: boolean) => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(item.note?.replace(/^\[[ x]\]\s*/, '') || '');
  const tag = PHOTO_TAGS.find((t) => t.color === item.color) || PHOTO_TAGS[4];
  const TagIcon = tag.icon;
  const isChecked = item.note?.startsWith("[x]");

  function saveNote() {
    const prefix = isChecked ? "[x] " : "[ ] ";
    onUpdateNote(prefix + noteText);
    setEditingNote(false);
  }

  return (
    <div className="group relative break-inside-avoid rounded-xl border bg-card overflow-hidden hover:shadow-lg transition-all">
      <div className="h-1.5 rounded-t-xl" style={{ backgroundColor: item.color }} />
      {item.image_url && <img src={item.image_url} alt={item.title} className="w-full object-cover max-h-64 cursor-pointer" onClick={() => window.open(item.image_url!, "_blank")} />}
      {!item.image_url && item.content && (
        <a href={item.content} target="_blank" rel="noopener noreferrer" className="block p-4 hover:bg-secondary/50 transition-colors">
          <div className="flex items-center gap-2 text-primary text-xs"><ExternalLink className="w-3 h-3" /><span className="truncate">{item.content}</span></div>
        </a>
      )}
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <button onClick={() => onToggleChecked(!isChecked)} className="mt-0.5 shrink-0">
            {isChecked
              ? <CheckCircle2 className="w-4 h-4 text-green-500" />
              : <Circle className="w-4 h-4 text-muted-foreground/40 hover:text-muted-foreground" />
            }
          </button>
          <div className="flex-1 min-w-0">
            {item.title && <p className={`text-sm font-medium ${isChecked ? "line-through text-muted-foreground" : ""}`}>{item.title}</p>}
          </div>
        </div>

        {/* Inline note / caption */}
        {editingNote ? (
          <div className="flex gap-1.5">
            <Input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add direction… e.g. 'Film from this angle'"
              className="h-7 text-xs flex-1"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") saveNote(); if (e.key === "Escape") setEditingNote(false); }}
            />
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={saveNote}><Save className="w-3 h-3" /></Button>
          </div>
        ) : (
          <button onClick={() => setEditingNote(true)} className="text-left w-full">
            {noteText ? (
              <p className="text-xs text-muted-foreground italic flex items-start gap-1">
                <Pencil className="w-2.5 h-2.5 mt-0.5 shrink-0 opacity-40" />
                {noteText}
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center gap-1">
                <Pencil className="w-2.5 h-2.5" /> Add a note or direction…
              </p>
            )}
          </button>
        )}

        <div className="flex items-center justify-between pt-1">
          <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0" style={{ borderColor: item.color, color: item.color }}>
            <TagIcon className="w-2.5 h-2.5" /> {tag.label}
          </Badge>
          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={onDelete}>
            <Trash2 className="w-3 h-3 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Video Uploader (with priority picker) ─── */
function VideoUploader({ onUpload, onAddLink }: {
  onUpload: (f: File) => void;
  onAddLink: (url: string, title: string, note: string, priority: string) => void;
}) {
  const [mode, setMode] = useState<"upload" | "link">("link");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState("#ef4444");
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant={mode === "link" ? "default" : "outline"} onClick={() => setMode("link")}>
            <Link2 className="w-3 h-3 mr-1" /> Paste Link
          </Button>
          <Button size="sm" variant={mode === "upload" ? "default" : "outline"} onClick={() => setMode("upload")}>
            <Upload className="w-3 h-3 mr-1" /> Upload Video
          </Button>
        </div>

        {mode === "link" ? (
          <div className="space-y-2">
            <Input placeholder="YouTube, TikTok, Instagram, or any video URL" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Input placeholder="Title (e.g. 'Great hook example')" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea placeholder="What to copy from this video — be specific! E.g. 'Copy the hook timing at 0:03' or 'Notice how she holds the product at 0:12'" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[60px] text-sm" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Priority:</span>
              {PRIORITY_BADGES.map((p) => {
                const PIcon = p.icon;
                return (
                  <button
                    key={p.color}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border transition-all ${priority === p.color ? "ring-2 ring-offset-1 ring-foreground/20 scale-105" : "opacity-50 hover:opacity-80"}`}
                    style={{ backgroundColor: p.color + "15", borderColor: p.color, color: p.color }}
                    onClick={() => setPriority(p.color)}
                  >
                    <PIcon className="w-3 h-3" /> {p.label}
                  </button>
                );
              })}
            </div>
            <Button size="sm" onClick={() => { onAddLink(url, title, note, priority); setUrl(""); setTitle(""); setNote(""); }} disabled={!url.trim()}>
              <Plus className="w-4 h-4 mr-1" /> Add Reference
            </Button>
          </div>
        ) : (
          <div
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Film className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Tap to upload a video file</p>
            <p className="text-xs text-muted-foreground mt-1">MP4, MOV, WebM</p>
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0]); }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Video Ref Card (with "what to copy" + priority + timestamps) ─── */
function VideoRefCard({ item, onDelete, onUpdateNote }: { item: PlanItem; onDelete: () => void; onUpdateNote: (note: string) => void }) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(item.note || "");
  const isUpload = item.content?.includes("plan-uploads");
  const isYouTube = /youtu\.?be/.test(item.content || "");
  const isTikTok = /tiktok\.com/.test(item.content || "");

  const priorityBadge = PRIORITY_BADGES.find((p) => p.color === item.color);
  const PriorityIcon = priorityBadge?.icon;

  function getEmbedUrl() {
    if (!isYouTube) return null;
    const match = item.content.match(/(?:v=|youtu\.be\/)([\w-]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  }

  const embedUrl = getEmbedUrl();

  return (
    <Card className="group overflow-hidden hover:shadow-lg transition-all">
      {/* Priority bar */}
      <div className="h-1.5" style={{ backgroundColor: item.color || "#f97316" }} />

      {embedUrl ? (
        <div className="aspect-video">
          <iframe src={embedUrl} className="w-full h-full" allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
        </div>
      ) : isUpload ? (
        <div className="aspect-video bg-secondary">
          <video src={item.content} controls className="w-full h-full object-cover" />
        </div>
      ) : (
        <a href={item.content} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 hover:bg-secondary/50 transition-colors">
          <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
            <Play className="w-5 h-5 text-orange-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{item.title || "Video reference"}</p>
            <p className="text-xs text-primary truncate flex items-center gap-1"><ExternalLink className="w-3 h-3" />{item.content}</p>
          </div>
        </a>
      )}

      <div className="p-3 space-y-2">
        {(embedUrl || isUpload) && item.title && <p className="text-sm font-semibold">{item.title}</p>}

        {/* "What to copy" callout */}
        {editingNote ? (
          <div className="space-y-1.5">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="What to copy — be specific! Add timestamps like '0:05 — great transition'"
              className="min-h-[80px] text-xs"
              autoFocus
            />
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { onUpdateNote(noteText); setEditingNote(false); }}>
                <Save className="w-3 h-3 mr-1" /> Save
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNote(false)}>Cancel</Button>
            </div>
          </div>
        ) : item.note ? (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 cursor-pointer" onClick={() => setEditingNote(true)}>
            <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> What to copy
            </p>
            <p className="text-xs text-foreground whitespace-pre-wrap">{item.note}</p>
          </div>
        ) : (
          <button onClick={() => setEditingNote(true)} className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1 transition-colors">
            <BookmarkPlus className="w-3 h-3" /> Add notes — what to copy, timestamps…
          </button>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-1.5 items-center">
            {priorityBadge && (
              <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0" style={{ borderColor: priorityBadge.color, color: priorityBadge.color }}>
                {PriorityIcon && <PriorityIcon className="w-2.5 h-2.5" />} {priorityBadge.label}
              </Badge>
            )}
            {(isTikTok || isYouTube) && (
              <Badge variant="outline" className="text-[10px]">{isYouTube ? "YouTube" : "TikTok"}</Badge>
            )}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(item.content); }}>
              <Copy className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={onDelete}>
              <Trash2 className="w-3 h-3 text-destructive" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ─── Script Card (with word count, sections, mentor notes) ─── */
function ScriptCard({ item, mentorNote, isMentorView, onUpdate, onDelete, onSaveMentorNote }: {
  item: PlanItem;
  mentorNote: string;
  isMentorView: boolean;
  onUpdate: (content: string) => void;
  onDelete: () => void;
  onSaveMentorNote: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);
  const [savingTitle, setSavingTitle] = useState(false);
  const [showMentorNotes, setShowMentorNotes] = useState(!!mentorNote);
  const [localMentorNote, setLocalMentorNote] = useState(mentorNote);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const mentorDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const estimatedDuration = Math.ceil(wordCount / 150 * 60);
  const durationMin = Math.floor(estimatedDuration / 60);
  const durationSec = estimatedDuration % 60;

  function handleContentChange(val: string) {
    setContent(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onUpdate(val), 800);
  }

  function handleMentorNoteChange(val: string) {
    setLocalMentorNote(val);
    if (mentorDebounceRef.current) clearTimeout(mentorDebounceRef.current);
    mentorDebounceRef.current = setTimeout(() => onSaveMentorNote(val), 800);
  }

  async function saveTitle() {
    setSavingTitle(true);
    await supabase.from("plan_items").update({ title } as any).eq("id", item.id);
    setSavingTitle(false);
    setEditing(false);
  }

  // Detect sections in the script
  const sections = content.split(/\n/).reduce<{ type: string; lines: string[] }[]>((acc, line) => {
    const sectionMatch = line.match(/^(🪝|❗|✅|📣|📖|🔄|🌟|💬|👋|💄|⭐|✨|📦|🔍|🧪)\s*(.+)/);
    if (sectionMatch) {
      acc.push({ type: sectionMatch[2].trim(), lines: [] });
    } else if (acc.length) {
      acc[acc.length - 1].lines.push(line);
    }
    return acc;
  }, []);

  const hasStructuredSections = sections.length >= 2;

  return (
    <Card className="overflow-hidden">
      <div className="h-1 bg-primary" />
      <CardHeader className="pb-2 flex flex-row items-center gap-2">
        {editing ? (
          <div className="flex items-center gap-2 flex-1">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); }} />
            <Button size="sm" variant="ghost" onClick={saveTitle} disabled={savingTitle}>
              {savingTitle ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={() => setEditing(true)}>
            <PenLine className="w-4 h-4 text-primary shrink-0" />
            <h3 className="text-sm font-semibold flex-1">{item.title || "Untitled Script"}</h3>
            <Pencil className="w-3 h-3 text-muted-foreground opacity-40" />
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </Button>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <Textarea
          placeholder="Write your script here… hooks, talking points, CTAs, transitions…"
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          className="min-h-[200px] resize-y font-mono text-sm leading-relaxed"
        />

        {/* Stats bar */}
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {wordCount} words</span>
          <span className="flex items-center gap-1">
            <Timer className="w-3 h-3" />
            ~{durationMin > 0 ? `${durationMin}m ` : ""}{durationSec}s at natural pace
          </span>
          <span className="flex items-center gap-1"><Save className="w-2.5 h-2.5" /> Auto-saves</span>
        </div>

        {/* Mentor Notes section */}
        <div className="border-t pt-3">
          <button
            className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400 hover:opacity-80 transition-opacity"
            onClick={() => setShowMentorNotes(!showMentorNotes)}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            {isMentorView ? "Your feedback notes" : "Mentor's feedback"}
            {localMentorNote && <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/30 text-amber-500">Has notes</Badge>}
            <ChevronDown className={`w-3 h-3 transition-transform ${showMentorNotes ? "rotate-180" : ""}`} />
          </button>
          {showMentorNotes && (
            <div className="mt-2">
              {isMentorView ? (
                <Textarea
                  value={localMentorNote}
                  onChange={(e) => handleMentorNoteChange(e.target.value)}
                  placeholder="Leave feedback for your creator here — suggestions, things to change, encouragement…"
                  className="min-h-[80px] text-sm border-amber-500/20 bg-amber-500/5"
                />
              ) : (
                localMentorNote ? (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                    <p className="text-sm whitespace-pre-wrap">{localMentorNote}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No feedback yet — your mentor will add notes here.</p>
                )
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
