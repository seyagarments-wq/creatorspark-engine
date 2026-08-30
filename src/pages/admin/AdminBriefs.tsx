import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Plus,
  Search,
  Edit,
  Trash2,
  Calendar,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AIBriefGenerator } from "@/components/admin/AIBriefGenerator";
import { BriefFileUpload } from "@/components/admin/BriefFileUpload";
import { useBriefUpload } from "@/hooks/use-brief-upload";

interface CreativeBrief {
  id: string;
  title: string;
  description: string | null;
  guidelines: string | null;
  dos: string[] | null;
  donts: string[] | null;
  deadline: string | null;
  is_active: boolean;
  created_at: string;
  brand: {
    id: string;
    name: string;
  } | null;
  campaign: {
    id: string;
    name: string;
  } | null;
}

interface Brand {
  id: string;
  name: string;
}

interface Campaign {
  id: string;
  name: string;
  brand_id: string;
}

export default function AdminBriefs() {
  const { toast } = useToast();
  const [briefs, setBriefs] = useState<CreativeBrief[]>([]);
  const [filteredBriefs, setFilteredBriefs] = useState<CreativeBrief[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBrief, setEditingBrief] = useState<CreativeBrief | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [guidelines, setGuidelines] = useState("");
  const [dosText, setDosText] = useState("");
  const [dontsText, setDontsText] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [deadline, setDeadline] = useState("");
  
  // File upload
  const {
    uploading,
    uploadedFiles,
    uploadMultipleFiles,
    removeFile,
    resetFiles,
    setInitialFiles,
  } = useBriefUpload();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterBriefs();
  }, [briefs, searchQuery]);

  async function fetchData() {
    try {
      const [briefsRes, brandsRes, campaignsRes] = await Promise.all([
        supabase
          .from("creative_briefs")
          .select(`
            *,
            brand:brands(id, name),
            campaign:campaigns(id, name)
          `)
          .order("created_at", { ascending: false }),
        supabase.from("brands").select("id, name").eq("is_active", true),
        supabase.from("campaigns").select("id, name, brand_id"),
      ]);

      if (briefsRes.error) throw briefsRes.error;
      setBriefs(briefsRes.data || []);
      setBrands(brandsRes.data || []);
      setCampaigns(campaignsRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  function filterBriefs() {
    if (!searchQuery) {
      setFilteredBriefs(briefs);
      return;
    }
    const query = searchQuery.toLowerCase();
    setFilteredBriefs(
      briefs.filter(
        (b) =>
          b.title.toLowerCase().includes(query) ||
          b.brand?.name.toLowerCase().includes(query) ||
          b.campaign?.name.toLowerCase().includes(query)
      )
    );
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setGuidelines("");
    setDosText("");
    setDontsText("");
    setSelectedBrandId("");
    setSelectedCampaignId("");
    setDeadline("");
    setEditingBrief(null);
    resetFiles();
  }

  function openEditDialog(brief: CreativeBrief) {
    setEditingBrief(brief);
    setTitle(brief.title);
    setDescription(brief.description || "");
    setGuidelines(brief.guidelines || "");
    setDosText(brief.dos?.join("\n") || "");
    setDontsText(brief.donts?.join("\n") || "");
    setSelectedBrandId(brief.brand?.id || "");
    setSelectedCampaignId(brief.campaign?.id || "");
    setDeadline(brief.deadline ? brief.deadline.split("T")[0] : "");
    // Load existing files
    setInitialFiles(
      (brief as any).example_video_urls || [],
      (brief as any).mood_board_urls || []
    );
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!title.trim() || !selectedBrandId) {
      toast({
        title: "Missing information",
        description: "Title and brand are required",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      // Separate files by type
      const videoUrls = uploadedFiles
        .filter((f) => f.type === "video")
        .map((f) => f.url);
      const moodBoardUrls = uploadedFiles
        .filter((f) => f.type === "document" || f.type === "image")
        .map((f) => f.url);

      const briefData = {
        title: title.trim(),
        description: description.trim() || null,
        guidelines: guidelines.trim() || null,
        dos: dosText.trim() ? dosText.split("\n").filter(Boolean) : null,
        donts: dontsText.trim() ? dontsText.split("\n").filter(Boolean) : null,
        brand_id: selectedBrandId,
        campaign_id: selectedCampaignId || null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        example_video_urls: videoUrls.length > 0 ? videoUrls : null,
        mood_board_urls: moodBoardUrls.length > 0 ? moodBoardUrls : null,
      };

      if (editingBrief) {
        const { error } = await supabase
          .from("creative_briefs")
          .update(briefData)
          .eq("id", editingBrief.id);
        if (error) throw error;
        toast({ title: "Brief updated!" });
      } else {
        const { error } = await supabase.from("creative_briefs").insert(briefData);
        if (error) throw error;
        toast({ title: "Brief created!" });
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(brief: CreativeBrief) {
    try {
      const { error } = await supabase
        .from("creative_briefs")
        .update({ is_active: !brief.is_active })
        .eq("id", brief.id);
      if (error) throw error;
      toast({ title: brief.is_active ? "Brief deactivated" : "Brief activated" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  }

  async function deleteBrief(id: string) {
    try {
      const { error } = await supabase.from("creative_briefs").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Brief deleted" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const stats = {
    total: briefs.length,
    active: briefs.filter((b) => b.is_active).length,
    withDeadline: briefs.filter((b) => b.deadline).length,
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Creative Briefs</h1>
            <p className="text-sm text-muted-foreground">Content guidelines for creators</p>
          </div>
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button variant="success">
                <Plus className="w-4 h-4 mr-2" />
                Create Brief
              </Button>
            </DialogTrigger>
            <AIBriefGenerator
              brands={brands}
              onBriefGenerated={(brief, brandId) => {
                setTitle(brief.title);
                setDescription(brief.description);
                setGuidelines(brief.guidelines);
                setDosText(brief.dos.join("\n"));
                setDontsText(brief.donts.join("\n"));
                setSelectedBrandId(brandId);
                setDialogOpen(true);
              }}
            />
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingBrief ? "Edit Brief" : "Create Brief"}</DialogTitle>
                <DialogDescription>
                  Define content guidelines for creators to follow
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Brand *</Label>
                    <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select brand" />
                      </SelectTrigger>
                      <SelectContent>
                        {brands.map((brand) => (
                          <SelectItem key={brand.id} value={brand.id}>
                            {brand.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Campaign (Optional)</Label>
                    <Select 
                      value={selectedCampaignId || "none"} 
                      onValueChange={(val) => setSelectedCampaignId(val === "none" ? "" : val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select campaign" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {campaigns
                          .filter((c) => !selectedBrandId || c.brand_id === selectedBrandId)
                          .map((campaign) => (
                            <SelectItem key={campaign.id} value={campaign.id}>
                              {campaign.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input
                    placeholder="e.g., Summer Collection Launch"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Brief overview of this campaign..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Guidelines</Label>
                  <Textarea
                    placeholder="Detailed guidelines for content creation..."
                    value={guidelines}
                    onChange={(e) => setGuidelines(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Do's (one per line)</Label>
                    <Textarea
                      placeholder="Show product in use&#10;Include call-to-action&#10;Tag our brand"
                      value={dosText}
                      onChange={(e) => setDosText(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Don'ts (one per line)</Label>
                    <Textarea
                      placeholder="No competitor logos&#10;Don't use profanity&#10;Avoid negative messaging"
                      value={dontsText}
                      onChange={(e) => setDontsText(e.target.value)}
                      rows={4}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Deadline</Label>
                  <Input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </div>

                {/* File Uploads */}
                <div className="grid grid-cols-2 gap-4">
                  <BriefFileUpload
                    label="Example Videos"
                    description="Upload example videos for creators to reference"
                    accept="video/*"
                    files={uploadedFiles}
                    uploading={uploading}
                    onUpload={uploadMultipleFiles}
                    onRemove={removeFile}
                    filterType="video"
                  />
                  <BriefFileUpload
                    label="Mood Board / Documents"
                    description="Upload PDFs, images, or other reference materials"
                    accept=".pdf,.doc,.docx,image/*"
                    files={uploadedFiles}
                    uploading={uploading}
                    onUpload={uploadMultipleFiles}
                    onRemove={removeFile}
                    filterType="document"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="success"
                  onClick={handleSubmit}
                  disabled={submitting || !title.trim() || !selectedBrandId}
                >
                  {editingBrief ? "Update Brief" : "Create Brief"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/10">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Briefs</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-success/10">
                <FileText className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-warning/10">
                <Calendar className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.withDeadline}</p>
                <p className="text-sm text-muted-foreground">With Deadlines</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search briefs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Briefs List */}
        {filteredBriefs.length === 0 ? (
          <div className="stat-card text-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No briefs found</h3>
            <p className="text-sm text-muted-foreground">
              {briefs.length === 0
                ? "Create your first brief to guide creators"
                : "Try adjusting your search"}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredBriefs.map((brief) => (
              <div key={brief.id} className="stat-card">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{brief.title}</h3>
                      <Badge variant={brief.is_active ? "default" : "outline"}>
                        {brief.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {brief.brand && <span>{brief.brand.name}</span>}
                      {brief.campaign && (
                        <>
                          <span>•</span>
                          <span>{brief.campaign.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(brief)}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleActive(brief)}>
                        {brief.is_active ? "Deactivate" : "Activate"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteBrief(brief.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {brief.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {brief.description}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Created {formatDate(brief.created_at)}</span>
                  {brief.deadline && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Due {formatDate(brief.deadline)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
