import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Calendar,
  CheckCircle,
  XCircle,
  ExternalLink,
  Download,
  Image,
  Eye,
  X,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface CreativeBrief {
  id: string;
  title: string;
  description: string | null;
  guidelines: string | null;
  dos: string[] | null;
  donts: string[] | null;
  mood_board_urls: string[] | null;
  example_video_urls: string[] | null;
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

export default function CreatorBriefs() {
  const isMobile = useIsMobile();
  const { profileId } = useAuth();
  const [briefs, setBriefs] = useState<CreativeBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null);
  const [viewingDocument, setViewingDocument] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (profileId) {
      fetchBriefs();
    }
  }, [profileId]);

  async function fetchBriefs() {
    try {
      // Get briefs for brands the creator is associated with
      const { data: creatorBrands } = await supabase
        .from("creator_brands")
        .select("brand_id")
        .eq("creator_id", profileId)
        .eq("status", "active");

      const brandIds = creatorBrands?.map(cb => cb.brand_id) || [];

      if (brandIds.length === 0) {
        setBriefs([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("creative_briefs")
        .select(`
          *,
          brand:brands(id, name),
          campaign:campaigns(id, name)
        `)
        .in("brand_id", brandIds)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBriefs(data || []);
    } catch (error) {
      console.error("Error fetching briefs:", error);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function isDeadlineSoon(deadline: string | null) {
    if (!deadline) return false;
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const daysUntil = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil <= 7 && daysUntil > 0;
  }

  function isDeadlinePassed(deadline: string | null) {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
  }

  if (loading) {
    return (
      <CreatorLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64" />)}
          </div>
        </div>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout>
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold">Creative Briefs</h1>
            <p className="text-xs md:text-sm text-muted-foreground hidden md:block">Content guidelines and requirements from brands</p>
          </div>
        </div>

        {/* Briefs Grid */}
        {briefs.length === 0 ? (
          <div className="stat-card text-center py-8 md:py-12">
            <FileText className="w-10 h-10 md:w-12 md:h-12 text-muted-foreground mx-auto mb-3 md:mb-4" />
            <h3 className="font-medium mb-2 text-sm md:text-base">No briefs available</h3>
            <p className="text-xs md:text-sm text-muted-foreground">
              Creative briefs from your brands will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-3 md:grid md:gap-6 md:grid-cols-2 md:space-y-0">
            {briefs.map((brief) => (
              <div
                key={brief.id}
                className="stat-card p-3 md:p-4 hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => setExpandedBrief(expandedBrief === brief.id ? null : brief.id)}
              >
                <div className="flex items-start justify-between gap-2 mb-2 md:mb-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5 md:mb-1 flex-wrap">
                      <h3 className="font-semibold text-sm md:text-lg truncate">{brief.title}</h3>
                      {brief.deadline && (
                        isDeadlinePassed(brief.deadline) ? (
                          <Badge variant="destructive" className="text-[10px] md:text-xs">Expired</Badge>
                        ) : isDeadlineSoon(brief.deadline) ? (
                          <Badge className="bg-warning/10 text-warning text-[10px] md:text-xs">Due Soon</Badge>
                        ) : null
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
                      {brief.brand && <span className="truncate">{brief.brand.name}</span>}
                      {brief.campaign && (
                        <>
                          <span>•</span>
                          <span className="truncate">{brief.campaign.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {brief.deadline && !isDeadlinePassed(brief.deadline) && (
                    <div className="flex items-center gap-1 text-[10px] md:text-sm text-muted-foreground shrink-0">
                      <Calendar className="w-3 h-3 md:w-4 md:h-4" />
                      <span className="hidden md:inline">{formatDate(brief.deadline)}</span>
                    </div>
                  )}
                </div>

                {brief.description && (
                  <p className="text-xs md:text-sm text-muted-foreground mb-2 md:mb-4 line-clamp-2">{brief.description}</p>
                )}

                {expandedBrief === brief.id && (
                  <div className="space-y-3 md:space-y-4 pt-3 md:pt-4 border-t">
                    {brief.guidelines && (
                      <div>
                        <h4 className="font-medium mb-1.5 md:mb-2 text-sm md:text-base">Guidelines</h4>
                        <p className="text-xs md:text-sm text-muted-foreground whitespace-pre-wrap">
                          {brief.guidelines}
                        </p>
                      </div>
                    )}

                    {brief.dos && brief.dos.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-1.5 md:mb-2 flex items-center gap-2 text-sm md:text-base">
                          <CheckCircle className="w-3 h-3 md:w-4 md:h-4 text-success" />
                          Do's
                        </h4>
                        <ul className="space-y-1">
                          {brief.dos.map((item, i) => (
                            <li key={i} className="text-xs md:text-sm flex items-start gap-2">
                              <span className="text-success mt-0.5">•</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {brief.donts && brief.donts.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-1.5 md:mb-2 flex items-center gap-2 text-sm md:text-base">
                          <XCircle className="w-3 h-3 md:w-4 md:h-4 text-destructive" />
                          Don'ts
                        </h4>
                        <ul className="space-y-1">
                          {brief.donts.map((item, i) => (
                            <li key={i} className="text-xs md:text-sm flex items-start gap-2">
                              <span className="text-destructive mt-0.5">•</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Mood Board / Documents Section */}
                    {brief.mood_board_urls && brief.mood_board_urls.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-1.5 md:mb-2 text-sm md:text-base">Reference Materials</h4>
                        <div className="space-y-2">
                          {brief.mood_board_urls.map((url, i) => {
                            const fileName = url.split("/").pop() || `File ${i + 1}`;
                            const isImage = url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                            const isPdf = url.match(/\.pdf$/i);
                            
                            return (
                              <div key={i} className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingDocument({ url, name: isPdf ? "Brief PDF" : `Image ${i + 1}` });
                                  }}
                                  className="h-8 text-xs flex-1 justify-start"
                                >
                                  {isPdf ? (
                                    <FileText className="w-4 h-4 mr-2 text-warning" />
                                  ) : isImage ? (
                                    <Image className="w-4 h-4 mr-2 text-success" />
                                  ) : (
                                    <Download className="w-4 h-4 mr-2" />
                                  )}
                                  <span className="truncate">{isPdf ? "View Brief PDF" : isImage ? `View Image ${i + 1}` : fileName}</span>
                                  <Eye className="w-3 h-3 ml-auto" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {brief.example_video_urls && brief.example_video_urls.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-1.5 md:mb-2 text-sm md:text-base">Example Videos</h4>
                        <div className="flex flex-wrap gap-2">
                          {brief.example_video_urls.map((url, i) => (
                            <Button
                              key={i}
                              variant="outline"
                              size="sm"
                              asChild
                              onClick={(e) => e.stopPropagation()}
                              className="h-7 md:h-8 text-xs"
                            >
                              <a href={url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-3 h-3 mr-1" />
                                Watch Example {i + 1}
                              </a>
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {expandedBrief !== brief.id && (
                  <p className="text-[10px] md:text-xs text-muted-foreground mt-2 md:mt-4">
                    Tap to view full brief →
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Document Viewer Dialog */}
        <Dialog open={!!viewingDocument} onOpenChange={() => setViewingDocument(null)}>
          <DialogContent className="w-[95vw] max-w-4xl h-[85vh] md:h-[90vh] p-0 overflow-hidden flex flex-col">
            <DialogHeader className="p-3 md:p-4 pb-2 border-b shrink-0">
              <div className="flex items-center justify-between pr-8">
                <DialogTitle className="text-sm md:text-base truncate">
                  {viewingDocument?.name || "Document"}
                </DialogTitle>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-8 text-xs"
                >
                  <a 
                    href={viewingDocument?.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    download
                  >
                    <Download className="w-4 h-4 mr-1" />
                    <span className="hidden sm:inline">Download</span>
                  </a>
                </Button>
              </div>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-auto bg-muted/30">
              {viewingDocument?.url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <img 
                    src={viewingDocument.url} 
                    alt={viewingDocument.name}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                  />
                </div>
              ) : (
                <iframe
                  src={`${viewingDocument?.url}#toolbar=1&navpanes=0`}
                  className="w-full h-full border-0"
                  title={viewingDocument?.name || "Document viewer"}
                  style={{ minHeight: '100%' }}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </CreatorLayout>
  );
}
