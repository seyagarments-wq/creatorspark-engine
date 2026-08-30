import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GraduationCap, FileText, Video, Link as LinkIcon, FileDown, ExternalLink } from "lucide-react";

interface Resource {
  id: string;
  title: string;
  description: string | null;
  category: string;
  content_type: string;
  content_url: string | null;
  content_body: string | null;
  thumbnail_url: string | null;
}

const ALL_CATEGORIES = "All";

const contentTypeConfig: Record<string, { icon: typeof FileText; color: string; bg: string }> = {
  article: { icon: FileText, color: "text-blue-500", bg: "bg-blue-500/10" },
  video: { icon: Video, color: "text-red-500", bg: "bg-red-500/10" },
  link: { icon: LinkIcon, color: "text-indigo-500", bg: "bg-indigo-500/10" },
  pdf: { icon: FileDown, color: "text-green-500", bg: "bg-green-500/10" },
};

export default function CreatorLearn() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES);
  const [selectedArticle, setSelectedArticle] = useState<Resource | null>(null);

  useEffect(() => {
    fetchResources();
  }, []);

  async function fetchResources() {
    try {
      const { data, error } = await supabase
        .from("resources")
        .select("id, title, description, category, content_type, content_url, content_body, thumbnail_url")
        .eq("is_published", true)
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

  const categories = [ALL_CATEGORIES, ...Array.from(new Set(resources.map((r) => r.category)))];
  const filtered = selectedCategory === ALL_CATEGORIES ? resources : resources.filter((r) => r.category === selectedCategory);

  function handleOpen(resource: Resource) {
    if (resource.content_type === "article" && resource.content_body) {
      setSelectedArticle(resource);
    } else if (resource.content_url) {
      window.open(resource.content_url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <CreatorLayout>
      <div className="space-y-4 md:space-y-6 animate-fade-in">
        <div>
          <h1 className="text-lg md:text-2xl font-bold">Learn</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Tips, guides, and resources to level up your content</p>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              className="text-xs whitespace-nowrap shrink-0"
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-36" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <GraduationCap className="w-12 h-12 mb-3" />
              <p className="font-medium">No resources available yet</p>
              <p className="text-sm">Check back soon for tips and guides!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((resource) => {
              const config = contentTypeConfig[resource.content_type] || contentTypeConfig.link;
              const Icon = config.icon;
              return (
                <Card
                  key={resource.id}
                  className="cursor-pointer hover:shadow-md transition-shadow group"
                  onClick={() => handleOpen(resource)}
                >
                  <CardContent className="p-3 md:p-4 space-y-2 md:space-y-3">
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-lg ${config.bg} shrink-0`}>
                        <Icon className={`w-5 h-5 ${config.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm group-hover:text-primary transition-colors line-clamp-2">
                          {resource.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-[10px]">{resource.category}</Badge>
                        </div>
                      </div>
                      {resource.content_url && (
                        <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                    {resource.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{resource.description}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Article reader dialog */}
      <Dialog open={!!selectedArticle} onOpenChange={(open) => !open && setSelectedArticle(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedArticle?.title}</DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm dark:prose-invert max-w-none pt-2 whitespace-pre-wrap">
            {selectedArticle?.content_body}
          </div>
        </DialogContent>
      </Dialog>
    </CreatorLayout>
  );
}
