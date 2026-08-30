import AdsLayout from "@/components/layout/AdsLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useState } from "react";
import {
  FileText,
  Link2,
  Tag,
  Globe,
  MousePointer,
  Plus,
  Trash2,
  Save,
  Copy,
} from "lucide-react";

const CTA_OPTIONS = [
  { value: "SHOP_NOW", label: "Shop Now" },
  { value: "LEARN_MORE", label: "Learn More" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "BOOK_NOW", label: "Book Now" },
  { value: "CONTACT_US", label: "Contact Us" },
  { value: "GET_OFFER", label: "Get Offer" },
  { value: "ORDER_NOW", label: "Order Now" },
  { value: "BUY_NOW", label: "Buy Now" },
];

export default function AdsSettings() {
  const queryClient = useQueryClient();

  // Fetch presets
  const { data: presets, isLoading: presetsLoading } = useQuery({
    queryKey: ["ad-presets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_presets")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch copy templates
  const { data: copyTemplates, isLoading: templatesLoading } = useQuery({
    queryKey: ["ad-copy-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_copy_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch landing pages
  const { data: landingPages, isLoading: pagesLoading } = useQuery({
    queryKey: ["ad-landing-pages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_landing_pages")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AdsLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Ad Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure your ad presets, templates, and defaults
          </p>
        </div>

        <Tabs defaultValue="copy" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5 h-auto">
            <TabsTrigger value="copy" className="text-xs">
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Copy Templates
            </TabsTrigger>
            <TabsTrigger value="links" className="text-xs">
              <Link2 className="w-3.5 h-3.5 mr-1.5" />
              Landing Pages
            </TabsTrigger>
            <TabsTrigger value="naming" className="text-xs">
              <Tag className="w-3.5 h-3.5 mr-1.5" />
              Naming
            </TabsTrigger>
            <TabsTrigger value="utm" className="text-xs">
              <Globe className="w-3.5 h-3.5 mr-1.5" />
              UTM Params
            </TabsTrigger>
            <TabsTrigger value="cta" className="text-xs">
              <MousePointer className="w-3.5 h-3.5 mr-1.5" />
              Default CTA
            </TabsTrigger>
          </TabsList>

          {/* Copy Templates */}
          <TabsContent value="copy">
            <CopyTemplatesTab templates={copyTemplates || []} />
          </TabsContent>

          {/* Landing Pages */}
          <TabsContent value="links">
            <LandingPagesTab pages={landingPages || []} />
          </TabsContent>

          {/* Naming Conventions */}
          <TabsContent value="naming">
            <NamingTab presets={presets} />
          </TabsContent>

          {/* UTM Parameters */}
          <TabsContent value="utm">
            <UtmTab presets={presets} />
          </TabsContent>

          {/* Default CTA */}
          <TabsContent value="cta">
            <CtaTab presets={presets} />
          </TabsContent>
        </Tabs>
      </div>
    </AdsLayout>
  );
}

// ── Copy Templates Tab ──
function CopyTemplatesTab({ templates }: { templates: any[] }) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newPrimaryTexts, setNewPrimaryTexts] = useState("");
  const [newHeadlines, setNewHeadlines] = useState("");

  const createTemplate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ad_copy_templates").insert({
        name: newName,
        primary_texts: newPrimaryTexts.split("\n").filter(Boolean),
        headlines: newHeadlines.split("\n").filter(Boolean),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-copy-templates"] });
      setNewName("");
      setNewPrimaryTexts("");
      setNewHeadlines("");
      toast.success("Copy template created");
    },
    onError: () => toast.error("Failed to create template"),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ad_copy_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-copy-templates"] });
      toast.success("Template deleted");
    },
  });

  return (
    <div className="space-y-4">
      <Card className="stat-card">
        <CardHeader>
          <CardTitle className="text-base">Create Copy Template</CardTitle>
          <CardDescription>Save reusable primary texts and headlines</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Template Name</Label>
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g., Summer Sale Copy"
            />
          </div>
          <div>
            <Label>Primary Texts (one per line, up to 5)</Label>
            <Textarea
              value={newPrimaryTexts}
              onChange={e => setNewPrimaryTexts(e.target.value)}
              placeholder="Enter primary text variations..."
              rows={4}
            />
          </div>
          <div>
            <Label>Headlines (one per line, up to 5)</Label>
            <Textarea
              value={newHeadlines}
              onChange={e => setNewHeadlines(e.target.value)}
              placeholder="Enter headline variations..."
              rows={4}
            />
          </div>
          <Button
            onClick={() => createTemplate.mutate()}
            disabled={!newName || createTemplate.isPending}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Template
          </Button>
        </CardContent>
      </Card>

      {templates.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Saved Templates</h3>
          {templates.map(t => (
            <Card key={t.id} className="stat-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">{t.name}</h4>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => deleteTemplate.mutate(t.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Primary Texts ({t.primary_texts?.length || 0})</p>
                    <div className="flex flex-wrap gap-1">
                      {t.primary_texts?.map((text: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs font-normal max-w-[200px] truncate">
                          {text}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Headlines ({t.headlines?.length || 0})</p>
                    <div className="flex flex-wrap gap-1">
                      {t.headlines?.map((text: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs font-normal max-w-[200px] truncate">
                          {text}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Landing Pages Tab ──
function LandingPagesTab({ pages }: { pages: any[] }) {
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const addPage = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ad_landing_pages").insert({
        label: newLabel,
        url: newUrl,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-landing-pages"] });
      setNewLabel("");
      setNewUrl("");
      toast.success("Landing page added");
    },
    onError: () => toast.error("Failed to add landing page"),
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      // Unset all defaults first
      await supabase.from("ad_landing_pages").update({ is_default: false }).neq("id", "");
      const { error } = await supabase.from("ad_landing_pages").update({ is_default: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-landing-pages"] });
      toast.success("Default landing page set");
    },
  });

  const deletePage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ad_landing_pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-landing-pages"] });
      toast.success("Landing page removed");
    },
  });

  return (
    <div className="space-y-4">
      <Card className="stat-card">
        <CardHeader>
          <CardTitle className="text-base">Add Landing Page</CardTitle>
          <CardDescription>Save product page URLs for quick selection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Label</Label>
              <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g., Summer Collection" />
            </div>
            <div>
              <Label>URL</Label>
              <Input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://yoursite.com/product" />
            </div>
          </div>
          <Button onClick={() => addPage.mutate()} disabled={!newLabel || !newUrl || addPage.isPending}>
            <Plus className="w-4 h-4 mr-2" />
            Add Page
          </Button>
        </CardContent>
      </Card>

      {pages.length > 0 && (
        <div className="space-y-2">
          {pages.map(p => (
            <Card key={p.id} className="stat-card">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{p.label}</p>
                    {p.is_default && <Badge className="text-[10px]">Default</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{p.url}</p>
                </div>
                <div className="flex items-center gap-1">
                  {!p.is_default && (
                    <Button variant="ghost" size="sm" onClick={() => setDefault.mutate(p.id)}>
                      Set Default
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deletePage.mutate(p.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Naming Convention Tab ──
function NamingTab({ presets }: { presets: any }) {
  const queryClient = useQueryClient();
  const [template, setTemplate] = useState(presets?.naming_template || "{creator}_{product}_{date}");

  const save = useMutation({
    mutationFn: async () => {
      if (!presets?.id) return;
      const { error } = await supabase.from("ad_presets").update({ naming_template: template }).eq("id", presets.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-presets"] });
      toast.success("Naming convention saved");
    },
  });

  return (
    <Card className="stat-card">
      <CardHeader>
        <CardTitle className="text-base">Naming Conventions</CardTitle>
        <CardDescription>
          Set up templates for how your ads are named. Use variables like {"{creator}"}, {"{product}"}, {"{date}"}, and {"{trybeid}"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Ad Name Template</Label>
          <Input value={template} onChange={e => setTemplate(e.target.value)} placeholder="{creator}_{product}_{date}" />
          <p className="text-xs text-muted-foreground mt-2">
            Preview: <span className="font-mono text-foreground">SarahM_SummerDress_Feb2026</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["{creator}", "{product}", "{date}", "{trybeid}"].map(v => (
            <Badge
              key={v}
              variant="secondary"
              className="cursor-pointer text-xs"
              onClick={() => setTemplate(prev => prev + v)}
            >
              {v}
            </Badge>
          ))}
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="w-4 h-4 mr-2" />
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

// ── UTM Parameters Tab ──
function UtmTab({ presets }: { presets: any }) {
  const queryClient = useQueryClient();
  const [source, setSource] = useState(presets?.utm_source || "meta");
  const [medium, setMedium] = useState(presets?.utm_medium || "paid");
  const [campaign, setCampaign] = useState(presets?.utm_campaign || "");
  const [content, setContent] = useState(presets?.utm_content || "");
  const [term, setTerm] = useState(presets?.utm_term || "");

  const save = useMutation({
    mutationFn: async () => {
      if (!presets?.id) return;
      const { error } = await supabase.from("ad_presets").update({
        utm_source: source,
        utm_medium: medium,
        utm_campaign: campaign,
        utm_content: content,
        utm_term: term,
      }).eq("id", presets.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-presets"] });
      toast.success("UTM parameters saved");
    },
  });

  return (
    <Card className="stat-card">
      <CardHeader>
        <CardTitle className="text-base">UTM Parameters</CardTitle>
        <CardDescription>Define standard tracking parameters auto-appended to landing page URLs</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Source</Label><Input value={source} onChange={e => setSource(e.target.value)} placeholder="meta" /></div>
          <div><Label>Medium</Label><Input value={medium} onChange={e => setMedium(e.target.value)} placeholder="paid" /></div>
          <div><Label>Campaign</Label><Input value={campaign} onChange={e => setCampaign(e.target.value)} placeholder="Optional" /></div>
          <div><Label>Content</Label><Input value={content} onChange={e => setContent(e.target.value)} placeholder="Optional" /></div>
          <div><Label>Term</Label><Input value={term} onChange={e => setTerm(e.target.value)} placeholder="Optional" /></div>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="w-4 h-4 mr-2" />
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Default CTA Tab ──
function CtaTab({ presets }: { presets: any }) {
  const queryClient = useQueryClient();
  const [cta, setCta] = useState(presets?.default_cta || "SHOP_NOW");

  const save = useMutation({
    mutationFn: async () => {
      if (!presets?.id) return;
      const { error } = await supabase.from("ad_presets").update({ default_cta: cta }).eq("id", presets.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-presets"] });
      toast.success("Default CTA saved");
    },
  });

  return (
    <Card className="stat-card">
      <CardHeader>
        <CardTitle className="text-base">Default Call-to-Action</CardTitle>
        <CardDescription>Set the default CTA button that's pre-selected when building new ads</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={cta} onValueChange={setCta}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CTA_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="w-4 h-4 mr-2" />
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
