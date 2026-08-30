import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Globe, ExternalLink, Instagram } from "lucide-react";

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
  social_links: SocialLinks | null;
}

// TikTok icon component
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

// YouTube icon component  
const YouTubeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

// Twitter/X icon component
const TwitterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

export default function CreatorBrand() {
  const { user } = useAuth();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      // Get creator's profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user?.id)
        .single();

      if (!profile) return;

      // Get creator's brand assignment
      const { data: assignment } = await supabase
        .from("creator_brands")
        .select("brand_id, brands(id, name, description, logo_url, website_url, commission_rate, social_links)")
        .eq("creator_id", profile.id)
        .eq("status", "active")
        .single();

      if (assignment?.brands) {
        // Handle the brands data - it comes as an object from the join
        const rawBrand = assignment.brands as unknown as Record<string, unknown>;
        const brandData: Brand = {
          id: rawBrand.id as string,
          name: rawBrand.name as string,
          description: rawBrand.description as string | null,
          logo_url: rawBrand.logo_url as string | null,
          website_url: rawBrand.website_url as string | null,
          commission_rate: rawBrand.commission_rate as number | null,
          social_links: rawBrand.social_links as SocialLinks | null,
        };
        setBrand(brandData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getSocialUrl = (platform: string, handle: string) => {
    const cleanHandle = handle.replace(/^@/, '');
    switch (platform) {
      case 'instagram':
        return `https://instagram.com/${cleanHandle}`;
      case 'tiktok':
        return `https://tiktok.com/@${cleanHandle}`;
      case 'youtube':
        return handle.startsWith('http') ? handle : `https://youtube.com/@${cleanHandle}`;
      case 'twitter':
        return `https://x.com/${cleanHandle}`;
      default:
        return '#';
    }
  };

  const socialPlatforms = [
    { key: 'instagram', icon: Instagram, label: 'Instagram' },
    { key: 'tiktok', icon: TikTokIcon, label: 'TikTok' },
    { key: 'youtube', icon: YouTubeIcon, label: 'YouTube' },
    { key: 'twitter', icon: TwitterIcon, label: 'X' },
  ];

  if (loading) {
    return (
      <CreatorLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 w-full max-w-lg" />
        </div>
      </CreatorLayout>
    );
  }

  if (!brand) {
    return (
      <CreatorLayout>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Brand Assigned</h2>
          <p className="text-muted-foreground max-w-md">
            You haven't been assigned to a brand yet. Please contact the administrator.
          </p>
        </div>
      </CreatorLayout>
    );
  }

  const hasSocialLinks = brand.social_links && Object.values(brand.social_links).some(v => v);

  return (
    <CreatorLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Brands</h1>
          <p className="text-muted-foreground">View your partnered brands</p>
        </div>

        {/* Brand Card */}
        <Card className="max-w-lg">
          <CardContent className="p-6 space-y-4">
            {/* Brand Header */}
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16 rounded-xl">
                <AvatarImage src={brand.logo_url || undefined} alt={brand.name} />
                <AvatarFallback className="rounded-xl text-xl bg-primary/10">
                  {brand.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl font-bold">{brand.name}</h2>
                {brand.website_url && (
                  <a
                    href={brand.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-primary hover:underline mt-1"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Visit Website
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Description */}
            {brand.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {brand.description}
              </p>
            )}

            {/* Social Links */}
            {hasSocialLinks && (
              <div className="flex items-center gap-2 pt-2">
                {socialPlatforms.map(({ key, icon: Icon, label }) => {
                  const handle = brand.social_links?.[key as keyof SocialLinks];
                  if (!handle) return null;
                  
                  return (
                    <a
                      key={key}
                      href={getSocialUrl(key, handle)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
                      title={label}
                    >
                      <Icon className="w-4 h-4" />
                    </a>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CreatorLayout>
  );
}
