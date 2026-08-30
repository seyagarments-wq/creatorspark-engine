import { useState, useEffect, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Instagram, Play } from "lucide-react";

const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;

interface LinkPreviewData {
  title: string | null;
  description: string | null;
  image: string | null;
  video: string | null;
  video_type: string | null;
  site_name: string | null;
  type: string | null;
  url: string;
}

// Known social sites that block server-side OG fetches
const SOCIAL_FALLBACKS: Record<string, (url: string) => LinkPreviewData> = {
  "instagram.com": (url) => ({
    title: url.includes("/reel/") ? "Instagram Reel" : url.includes("/p/") ? "Instagram Post" : "Instagram",
    description: "Tap to view on Instagram",
    image: null,
    video: null,
    video_type: null,
    site_name: "Instagram",
    type: "website",
    url,
  }),
  "tiktok.com": (url) => ({
    title: "TikTok Video",
    description: "Tap to view on TikTok",
    image: null,
    video: null,
    video_type: null,
    site_name: "TikTok",
    type: "video",
    url,
  }),
};

function getSocialFallback(url: string): LinkPreviewData | null {
  try {
    const hostname = new URL(url).hostname.replace("www.", "");
    for (const [domain, fallback] of Object.entries(SOCIAL_FALLBACKS)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return fallback(url);
      }
    }
  } catch {}
  return null;
}

// In-memory cache so we don't re-fetch previews
const previewCache = new Map<string, LinkPreviewData | null>();

function useLinkPreview(url: string | null) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(
    url ? previewCache.get(url) ?? null : null
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) return;
    if (previewCache.has(url)) {
      setPreview(previewCache.get(url) ?? null);
      return;
    }

    // Check for social fallback first
    const fallback = getSocialFallback(url);

    let cancelled = false;
    setLoading(true);

    supabase.functions
      .invoke("fetch-link-preview", { body: { url } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.title) {
          // Use social fallback if server fetch fails
          const result = fallback || null;
          previewCache.set(url, result);
          setPreview(result);
        } else {
          previewCache.set(url, data);
          setPreview(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          previewCache.set(url, fallback || null);
          setPreview(fallback || null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [url]);

  return { preview, loading };
}

function SocialIcon({ siteName }: { siteName: string | null }) {
  if (siteName === "Instagram") {
    return (
      <div className="w-full aspect-video bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center">
        <Instagram className="w-12 h-12 text-white" />
      </div>
    );
  }
  if (siteName === "TikTok") {
    return (
      <div className="w-full aspect-video bg-black flex items-center justify-center">
        <Play className="w-12 h-12 text-white" />
      </div>
    );
  }
  return null;
}

function LinkPreviewCard({ url }: { url: string }) {
  const { preview, loading } = useLinkPreview(url);

  if (loading) {
    return (
      <div className="mt-2 rounded-xl border bg-card/50 p-3 animate-pulse">
        <div className="h-3 bg-muted rounded w-2/3 mb-2" />
        <div className="h-2 bg-muted rounded w-1/2" />
      </div>
    );
  }

  if (!preview) return null;

  const domain = (() => {
    try { return new URL(url).hostname.replace("www.", ""); } catch { return ""; }
  })();

  const isSocialFallback = !preview.image && (preview.site_name === "Instagram" || preview.site_name === "TikTok");

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="mt-2 block rounded-xl border bg-card overflow-hidden hover:bg-accent/30 transition-colors group"
      onClick={(e) => e.stopPropagation()}
    >
      {preview.image ? (
        <div className="w-full aspect-video bg-muted overflow-hidden">
          <img
            src={preview.image}
            alt={preview.title || ""}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      ) : isSocialFallback ? (
        <SocialIcon siteName={preview.site_name} />
      ) : null}
      <div className="p-3 space-y-1">
        {preview.site_name && (
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {preview.site_name}
          </p>
        )}
        {preview.title && (
          <p className="text-sm font-semibold line-clamp-2 text-foreground">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {preview.description}
          </p>
        )}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-1">
          <ExternalLink className="w-3 h-3" />
          <span>{domain}</span>
        </div>
      </div>
    </a>
  );
}

interface ChatMessageContentProps {
  content: string;
  className?: string;
}

export const ChatMessageContent = memo(function ChatMessageContent({
  content,
  className = "",
}: ChatMessageContentProps) {
  const urls = content.match(URL_REGEX) || [];
  const firstUrl = urls.length > 0 ? urls[0] : null;

  // Split content into text and link segments
  const parts = content.split(URL_REGEX);

  return (
    <div className={className}>
      <p className="text-sm whitespace-pre-wrap">
        {parts.map((part, i) =>
          URL_REGEX.test(part) ? (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener"
              className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </p>
      {firstUrl && <LinkPreviewCard url={firstUrl} />}
    </div>
  );
});
