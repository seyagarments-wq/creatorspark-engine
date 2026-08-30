import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Building2, Globe, Percent, Upload, Save, Image, Instagram } from "lucide-react";

interface SocialLinks {
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  twitter?: string;
}

interface Brand {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  commission_rate: number | null;
  is_active: boolean | null;
  social_links: SocialLinks | null;
}

// Social media icons
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

const YouTubeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const TwitterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

export default function AdminBrand() {
  const { toast } = useToast();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [commissionRate, setCommissionRate] = useState("10");
  const [logoUrl, setLogoUrl] = useState("");
  
  // Social links state
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [youtube, setYoutube] = useState("");
  const [twitter, setTwitter] = useState("");

  useEffect(() => {
    fetchBrand();
  }, []);

  async function fetchBrand() {
    try {
      // Get the first (primary) brand
      const { data, error } = await supabase
        .from("brands")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        setBrand(data as Brand);
        setName(data.name || "");
        setDescription(data.description || "");
        setWebsiteUrl(data.website_url || "");
        setCommissionRate(String(data.commission_rate || 10));
        setLogoUrl(data.logo_url || "");
        
        // Load social links
        const socialLinks = data.social_links as SocialLinks | null;
        if (socialLinks) {
          setInstagram(socialLinks.instagram || "");
          setTiktok(socialLinks.tiktok || "");
          setYoutube(socialLinks.youtube || "");
          setTwitter(socialLinks.twitter || "");
        }
      }
    } catch (error) {
      console.error("Error fetching brand:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const socialLinks: Record<string, string> = {};
      if (instagram) socialLinks.instagram = instagram;
      if (tiktok) socialLinks.tiktok = tiktok;
      if (youtube) socialLinks.youtube = youtube;
      if (twitter) socialLinks.twitter = twitter;

      const brandData = {
        name,
        description: description || null,
        website_url: websiteUrl || null,
        commission_rate: parseFloat(commissionRate) || 10,
        logo_url: logoUrl || null,
        social_links: Object.keys(socialLinks).length > 0 ? socialLinks : null,
      };

      if (brand) {
        // Update existing brand
        const { error } = await supabase
          .from("brands")
          .update(brandData)
          .eq("id", brand.id);

        if (error) throw error;
      } else {
        // Create new brand
        const { error } = await supabase
          .from("brands")
          .insert([{ ...brandData, is_active: true }]);

        if (error) throw error;
      }

      // Refresh brand data
      await fetchBrand();

      toast({
        title: "Brand saved",
        description: "Your brand details have been updated successfully.",
      });
    } catch (error) {
      console.error("Error saving brand:", error);
      toast({
        title: "Error saving brand",
        description: "There was an error saving your brand details.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Upload to avatars bucket in brand-logos folder (admin-only access)
      const fileExt = file.name.split(".").pop();
      const fileName = `brand-logos/brand-logo-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      setLogoUrl(urlData.publicUrl);
      toast({
        title: "Logo uploaded",
        description: "Don't forget to save your changes!",
      });
    } catch (error) {
      console.error("Error uploading logo:", error);
      toast({
        title: "Upload failed",
        description: "There was an error uploading your logo.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-6 animate-fade-in">
          <Skeleton className="h-10 w-48" />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="w-6 h-6" />
              Brand Settings
            </h1>
            <p className="text-muted-foreground">
              Manage your brand profile and appearance
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Brand Identity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Brand Identity</CardTitle>
              <CardDescription>
                Your brand name and logo that creators will see
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Logo Upload */}
              <div className="flex items-center gap-6">
                <Avatar className="w-20 h-20 rounded-xl">
                  <AvatarImage src={logoUrl} alt="Brand logo" />
                  <AvatarFallback className="rounded-xl bg-secondary">
                    <Building2 className="w-8 h-8 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <Label htmlFor="logo-upload" className="cursor-pointer">
                    <div className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Upload className="w-4 h-4" />
                      {uploading ? "Uploading..." : "Upload Logo"}
                    </div>
                  </Label>
                  <input
                    id="logo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                    disabled={uploading}
                  />
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG up to 2MB. Square recommended.
                  </p>
                </div>
              </div>

              {/* Brand Name */}
              <div className="space-y-2">
                <Label htmlFor="brand-name">Brand Name</Label>
                <Input
                  id="brand-name"
                  placeholder="Your Brand Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Tell creators about your brand..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Brand Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Brand Settings</CardTitle>
              <CardDescription>
                Configure commission rates and links
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Website URL */}
              <div className="space-y-2">
                <Label htmlFor="website" className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Website URL
                </Label>
                <Input
                  id="website"
                  type="url"
                  placeholder="https://yourbrand.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                />
              </div>

              {/* Commission Rate */}
              <div className="space-y-2">
                <Label htmlFor="commission" className="flex items-center gap-2">
                  <Percent className="w-4 h-4" />
                  Default Commission Rate
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="commission"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="10"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  This is the default commission for new creators. You can set individual rates per creator.
                </p>
              </div>

              {/* Logo URL (for manual entry) */}
              <div className="space-y-2">
                <Label htmlFor="logo-url" className="flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  Logo URL (optional)
                </Label>
                <Input
                  id="logo-url"
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Or paste a direct link to your logo image
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Social Links */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Social Media Links</CardTitle>
              <CardDescription>
                Add your brand's social media handles for creators to follow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Instagram */}
                <div className="space-y-2">
                  <Label htmlFor="instagram" className="flex items-center gap-2">
                    <Instagram className="w-4 h-4" />
                    Instagram
                  </Label>
                  <Input
                    id="instagram"
                    placeholder="@yourbrand"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                  />
                </div>

                {/* TikTok */}
                <div className="space-y-2">
                  <Label htmlFor="tiktok" className="flex items-center gap-2">
                    <TikTokIcon className="w-4 h-4" />
                    TikTok
                  </Label>
                  <Input
                    id="tiktok"
                    placeholder="@yourbrand"
                    value={tiktok}
                    onChange={(e) => setTiktok(e.target.value)}
                  />
                </div>

                {/* YouTube */}
                <div className="space-y-2">
                  <Label htmlFor="youtube" className="flex items-center gap-2">
                    <YouTubeIcon className="w-4 h-4" />
                    YouTube
                  </Label>
                  <Input
                    id="youtube"
                    placeholder="@yourbrand or channel URL"
                    value={youtube}
                    onChange={(e) => setYoutube(e.target.value)}
                  />
                </div>

                {/* X (Twitter) */}
                <div className="space-y-2">
                  <Label htmlFor="twitter" className="flex items-center gap-2">
                    <TwitterIcon className="w-4 h-4" />
                    X (Twitter)
                  </Label>
                  <Input
                    id="twitter"
                    placeholder="@yourbrand"
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Preview */}
        {brand && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Brand Preview</CardTitle>
              <CardDescription>
                This is how your brand appears to creators
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-4 p-4 rounded-xl bg-secondary/30">
                <Avatar className="w-16 h-16 rounded-xl flex-shrink-0">
                  <AvatarImage src={logoUrl} alt="Brand logo" />
                  <AvatarFallback className="rounded-xl bg-primary/10">
                    <Building2 className="w-6 h-6 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">{name || "Your Brand Name"}</h3>
                  <p className="text-sm text-muted-foreground">
                    {description || "Add a description for your brand"}
                  </p>
                  {websiteUrl && (
                    <a
                      href={websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Globe className="w-3 h-3" />
                      {websiteUrl}
                    </a>
                  )}
                  {/* Social Links Preview */}
                  {(instagram || tiktok || youtube || twitter) && (
                    <div className="flex items-center gap-2 pt-1">
                      {instagram && (
                        <div className="p-1.5 rounded bg-secondary" title="Instagram">
                          <Instagram className="w-3.5 h-3.5" />
                        </div>
                      )}
                      {tiktok && (
                        <div className="p-1.5 rounded bg-secondary" title="TikTok">
                          <TikTokIcon className="w-3.5 h-3.5" />
                        </div>
                      )}
                      {youtube && (
                        <div className="p-1.5 rounded bg-secondary" title="YouTube">
                          <YouTubeIcon className="w-3.5 h-3.5" />
                        </div>
                      )}
                      {twitter && (
                        <div className="p-1.5 rounded bg-secondary" title="X">
                          <TwitterIcon className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
