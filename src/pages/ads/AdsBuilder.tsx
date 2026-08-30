import AdsLayout from "@/components/layout/AdsLayout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Check, Search, Video, Megaphone, Settings, Rocket,
  User, TrendingUp, DollarSign, Calendar, Target, BarChart3, AlertTriangle, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Select Submissions", icon: Video },
  { label: "Campaigns & Ad Sets", icon: Megaphone },
  { label: "Configure Ads", icon: Settings },
  { label: "Review & Launch", icon: Rocket },
];

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

const OBJECTIVE_OPTIONS = [
  { value: "OUTCOME_SALES", label: "Sales" },
  { value: "OUTCOME_TRAFFIC", label: "Traffic" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement" },
  { value: "OUTCOME_LEADS", label: "Leads" },
  { value: "OUTCOME_AWARENESS", label: "Awareness" },
  { value: "OUTCOME_APP_PROMOTION", label: "App Promotion" },
];

const ATTRIBUTION_OPTIONS = [
  { value: "1d_click", label: "1-day click" },
  { value: "7d_click", label: "7-day click" },
  { value: "1d_click_1d_view", label: "1-day click, 1-day view" },
  { value: "7d_click_1d_view", label: "7-day click, 1-day view" },
];

const MANUAL_PLACEMENTS = {
  facebook: [
    { value: "feed", label: "Feed" },
    { value: "story", label: "Stories" },
    { value: "reels", label: "Reels" },
    { value: "instream_video", label: "In-Stream" },
    { value: "search", label: "Search" },
  ],
  instagram: [
    { value: "stream", label: "Feed" },
    { value: "story", label: "Stories" },
    { value: "reels", label: "Reels" },
    { value: "explore", label: "Explore" },
  ],
  messenger: [
    { value: "messenger_home", label: "Inbox" },
    { value: "story", label: "Stories" },
  ],
  audience_network: [
    { value: "classic", label: "Native / Banner / Interstitial" },
  ],
};

const DEFAULT_ADVANTAGE_CREATIVE: Record<string, boolean> = {
  ig_video_native_subtitle: true,
  product_metadata_automation: false,
  profile_card: false,
  text_overlay_translation: true,
};

function sanitizeAdvantageCreative(input?: Record<string, boolean> | null): Record<string, boolean> {
  const raw = input || {};
  return {
    ig_video_native_subtitle: raw.ig_video_native_subtitle ?? raw.video_auto_crop ?? DEFAULT_ADVANTAGE_CREATIVE.ig_video_native_subtitle,
    product_metadata_automation: raw.product_metadata_automation ?? raw.browse_shop ?? DEFAULT_ADVANTAGE_CREATIVE.product_metadata_automation,
    profile_card: raw.profile_card ?? raw.relevant_comments ?? DEFAULT_ADVANTAGE_CREATIVE.profile_card,
    text_overlay_translation: raw.text_overlay_translation ?? raw.text_improvements ?? DEFAULT_ADVANTAGE_CREATIVE.text_overlay_translation,
  };
}

export default function AdsBuilder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const retryLaunchId = searchParams.get("retry");
  const [step, setStep] = useState(0);
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("all");

  // Campaign config
  const [campaignMode, setCampaignMode] = useState<"existing" | "new">("existing");
  const [campaignName, setCampaignName] = useState("");
  const [existingCampaignId, setExistingCampaignId] = useState("");
  const [adSetMode, setAdSetMode] = useState<"existing" | "new">("existing");
  const [adSetName, setAdSetName] = useState("");
  const [existingAdSetId, setExistingAdSetId] = useState("");

  // Enhanced Meta-style fields
  const [objective, setObjective] = useState("OUTCOME_SALES");
  const [dailyBudget, setDailyBudget] = useState("");
  const [placementMode, setPlacementMode] = useState<"advantage_plus" | "manual">("advantage_plus");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, string[]>>({
    facebook: [],
    instagram: [],
    messenger: [],
    audience_network: [],
  });
  const [attributionWindow, setAttributionWindow] = useState("7d_click_1d_view");
  const [multiAdvertiser, setMultiAdvertiser] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Ad preferences
  const [identityType, setIdentityType] = useState("brand");
  const [landingUrl, setLandingUrl] = useState("");
  const [cta, setCta] = useState("SHOP_NOW");
  const [primaryTexts, setPrimaryTexts] = useState("");
  const [headlines, setHeadlines] = useState("");
  const [launchStatus, setLaunchStatus] = useState("paused");
  const [advantageCreative, setAdvantageCreative] = useState<Record<string, boolean>>(DEFAULT_ADVANTAGE_CREATIVE);

  // Fetch approved videos
  const { data: videos, isLoading: videosLoading } = useQuery({
    queryKey: ["approved-videos-for-ads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("id, title, unique_video_id, thumbnail_url, video_url, created_at, creator_id, status, meta_video_id, meta_status, profiles:creator_id(full_name, instagram_username)")
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch previously launched videos with performance metrics
  const { data: launchHistory } = useQuery({
    queryKey: ["video-launch-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_launch_items")
        .select("video_id, created_at, meta_status, ad_launches!inner(status, created_at)")
        .in("meta_status", ["active", "pending", "error"]);
      if (error) throw error;
      const map = new Map<string, { count: number; lastLaunch: string; statuses: string[] }>();
      for (const item of data || []) {
        const existing = map.get(item.video_id) || { count: 0, lastLaunch: "", statuses: [] };
        existing.count++;
        const launchDate = (item as any).ad_launches?.created_at || item.created_at;
        if (!existing.lastLaunch || launchDate > existing.lastLaunch) existing.lastLaunch = launchDate;
        existing.statuses.push(item.meta_status || "");
        map.set(item.video_id, existing);
      }
      return map;
    },
  });

  // Fetch currently live ads from launch items + recent ad_insights with V-ID matching
  const { data: liveAds } = useQuery({
    queryKey: ["currently-live-ads"],
    queryFn: async () => {
      const set = new Set<string>();
      // Source 1: active launch items
      const { data: launchItems } = await supabase
        .from("ad_launch_items")
        .select("video_id, meta_ad_id, ad_name")
        .eq("meta_status", "active");
      for (const item of launchItems || []) set.add(item.video_id);

      // Source 2: recent ad_insights with impressions in last 48h matched by V-ID
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentInsights } = await supabase
        .from("ad_insights")
        .select("object_name")
        .eq("level", "ad")
        .gt("fetched_at", twoDaysAgo)
        .gt("impressions", 0)
        .limit(500);
      
      if (recentInsights && videos) {
        const videosByVId = new Map(videos.map(v => [v.unique_video_id, v.id]));
        for (const insight of recentInsights) {
          const adName = insight.object_name || "";
          const match = adName.match(/\bV\d+-\d+\b/i);
          if (match) {
            const vId = match[0].toUpperCase();
            const videoId = videosByVId.get(vId);
            if (videoId) set.add(videoId);
          }
        }
      }
      return set;
    },
    enabled: !!videos,
  });

  // Fetch performance metrics for previously launched videos
  const { data: videoPerformance } = useQuery({
    queryKey: ["video-performance-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("performance_data")
        .select("video_id, spend, revenue");
      if (error) throw error;
      const map = new Map<string, { totalSpend: number; totalRevenue: number }>();
      for (const row of data || []) {
        const existing = map.get(row.video_id) || { totalSpend: 0, totalRevenue: 0 };
        existing.totalSpend += Number(row.spend || 0);
        existing.totalRevenue += Number(row.revenue || 0);
        map.set(row.video_id, existing);
      }
      return map;
    },
  });

  // Fetch existing Meta campaigns from ad_insights
  const { data: existingCampaigns } = useQuery({
    queryKey: ["existing-meta-campaigns"],
    enabled: campaignMode === "existing",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_insights")
        .select("object_id, object_name")
        .eq("level", "campaign")
        .order("fetched_at", { ascending: false });
      if (error) throw error;
      // Dedupe by object_id
      const map = new Map<string, string>();
      for (const row of data || []) {
        if (!map.has(row.object_id)) map.set(row.object_id, row.object_name || "Unnamed Campaign");
      }
      return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    },
  });

  // Fetch ad sets for selected campaign
  const { data: existingAdSets } = useQuery({
    queryKey: ["existing-meta-adsets", existingCampaignId],
    enabled: adSetMode === "existing" && !!existingCampaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_insights")
        .select("object_id, object_name")
        .eq("level", "adset")
        .eq("campaign_id", existingCampaignId)
        .order("fetched_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of data || []) {
        if (!map.has(row.object_id)) map.set(row.object_id, row.object_name || "Unnamed Ad Set");
      }
      return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    },
  });

  const { data: presets } = useQuery({
    queryKey: ["ad-presets"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_presets").select("*").limit(1).single();
      return data;
    },
  });

  const { data: copyTemplates } = useQuery({
    queryKey: ["ad-copy-templates"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_copy_templates").select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: landingPages } = useQuery({
    queryKey: ["ad-landing-pages"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_landing_pages").select("*").order("is_default", { ascending: false });
      return data || [];
    },
  });

  // Retry: load failed launch data
  const { data: retryLaunch } = useQuery({
    queryKey: ["retry-launch", retryLaunchId],
    enabled: !!retryLaunchId,
    queryFn: async () => {
      const { data: launch, error: launchError } = await supabase
        .from("ad_launches")
        .select("*")
        .eq("id", retryLaunchId!)
        .single();
      if (launchError) throw launchError;
      const { data: items, error: itemsError } = await supabase
        .from("ad_launch_items")
        .select("video_id, ad_name, identity_type, primary_text, headline, landing_url, cta, campaign_id, ad_set_id")
        .eq("launch_id", retryLaunchId!);
      if (itemsError) throw itemsError;
      return { launch, items: items || [] };
    },
  });

  // Pre-fill form from retry data
  useEffect(() => {
    if (!retryLaunch) return;
    const { launch, items } = retryLaunch;
    const cc = launch.campaign_config as any;
    const ac = launch.ad_set_config as any;
    const ap = launch.ad_preferences as any;

    // Videos
    setSelectedVideos(items.map((i: any) => i.video_id));
    // Campaign
    if (cc?.mode) setCampaignMode(cc.mode);
    if (cc?.name) setCampaignName(cc.name);
    if (cc?.campaign_id) setExistingCampaignId(cc.campaign_id);
    if (cc?.objective) setObjective(cc.objective);
    if (cc?.daily_budget) setDailyBudget(String(cc.daily_budget / 100));
    // Ad Set
    if (ac?.mode) setAdSetMode(ac.mode);
    if (ac?.name) setAdSetName(ac.name);
    if (ac?.ad_set_id) setExistingAdSetId(ac.ad_set_id);
    if (ac?.placement?.mode) setPlacementMode(ac.placement.mode);
    if (ac?.placement?.platforms) setSelectedPlatforms(ac.placement.platforms);
    if (ac?.attribution_window) setAttributionWindow(ac.attribution_window);
    if (ac?.multi_advertiser !== undefined) setMultiAdvertiser(ac.multi_advertiser);
    if (ac?.start_date) setStartDate(ac.start_date);
    if (ac?.end_date) setEndDate(ac.end_date);
    // Preferences
    if (ap?.identity_type) setIdentityType(ap.identity_type);
    if (ap?.landing_url) setLandingUrl(ap.landing_url);
    if (ap?.cta) setCta(ap.cta);
    if (ap?.primary_texts) setPrimaryTexts(ap.primary_texts.join("\n"));
    if (ap?.headlines) setHeadlines(ap.headlines.join("\n"));
    if (ap?.launch_status) setLaunchStatus(ap.launch_status);
    if (ap?.advantage_creative) {
      setAdvantageCreative(sanitizeAdvantageCreative(ap.advantage_creative as Record<string, boolean>));
    }

    // Jump to review step
    setStep(3);
    toast.info("Loaded failed launch — review and retry");
  }, [retryLaunch]);

  const creators = videos
    ? [...new Map(videos.map(v => [v.creator_id, (v as any).profiles?.full_name || "Unknown"])).entries()]
    : [];

  const filteredVideos = videos?.filter(v => {
    const matchesSearch = !searchQuery ||
      v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.unique_video_id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCreator = creatorFilter === "all" || v.creator_id === creatorFilter;
    return matchesSearch && matchesCreator;
  }) || [];

  const toggleVideo = (id: string) => {
    setSelectedVideos(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const selectAll = () => {
    setSelectedVideos(prev => prev.length === filteredVideos.length ? [] : filteredVideos.map(v => v.id));
  };

  const togglePlacement = (platform: string, position: string) => {
    setSelectedPlatforms(prev => {
      const current = prev[platform] || [];
      return {
        ...prev,
        [platform]: current.includes(position)
          ? current.filter(p => p !== position)
          : [...current, position],
      };
    });
  };

  // Launch polling
  const [activeLaunchId, setActiveLaunchId] = useState<string | null>(null);
  const [launchProgress, setLaunchProgress] = useState<{ status: string; ads_created: number; total_ads: number; items?: { pending: number; active: number; error: number } } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!activeLaunchId) return;
    const poll = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("check-launch-status", { body: { launchId: activeLaunchId } });
        if (error) return;
        setLaunchProgress(data);
        if (data.status === "completed" || data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          if (data.status === "completed") toast.success(`${data.ads_created} ads created successfully!`);
          else toast.error(data.error_message || "Launch failed");
        }
      } catch (_) {}
    };
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeLaunchId]);

  // Build placement config for Meta API
  const buildPlacementConfig = () => {
    if (placementMode === "advantage_plus") return { mode: "advantage_plus" };
    return {
      mode: "manual",
      platforms: selectedPlatforms,
    };
  };

  // Fetch meta credentials for preflight checks
  const { data: metaCredentials } = useQuery({
    queryKey: ["meta-credentials-preflight"],
    queryFn: async () => {
      const { data } = await supabase
        .from("meta_credentials")
        .select("id, status, page_id, ad_account_id, access_token")
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Preflight validation
  const getPreflightErrors = () => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!metaCredentials) {
      errors.push("Meta Ads not connected — go to Settings to connect your account");
      return { errors, warnings };
    }
    if (!metaCredentials.page_id) {
      errors.push("Facebook Page ID missing — update in [Admin Settings → Meta Connection](/admin/settings)");
    }
    const selectedVideoData = videos?.filter(v => selectedVideos.includes(v.id)) || [];
    const notUploaded = selectedVideoData.filter(v => !(v as any).meta_video_id);
    if (notUploaded.length > 0) {
      errors.push(`${notUploaded.length} video(s) not uploaded to Meta: ${notUploaded.map(v => v.unique_video_id).join(", ")}`);
    }
    const noThumbnail = selectedVideoData.filter(v => (v as any).meta_video_id && !v.thumbnail_url);
    if (noThumbnail.length > 0) {
      warnings.push(`${noThumbnail.length} video(s) missing local thumbnails — Meta will attempt to use auto-generated thumbnails`);
    }
    return { errors, warnings };
  };

  const [preflightErrors, setPreflightErrors] = useState<string[]>([]);
  const [preflightWarnings, setPreflightWarnings] = useState<string[]>([]);

  const launchAds = useMutation({
    mutationFn: async () => {
      // Run preflight checks
      const { errors, warnings } = getPreflightErrors();
      if (errors.length > 0) {
        setPreflightErrors(errors);
        setPreflightWarnings(warnings);
        throw new Error(errors[0]);
      }
      setPreflightErrors([]);
      setPreflightWarnings(warnings);
      if (warnings.length > 0) {
        warnings.forEach(w => toast.warning(w));
      }

      const selectedVideoData = videos?.filter(v => selectedVideos.includes(v.id)) || [];
      
      const { data: launch, error: launchError } = await supabase
        .from("ad_launches")
        .insert({
          status: "pending",
          total_ads: selectedVideoData.length,
          campaign_config: {
            mode: campaignMode,
            name: campaignName,
            campaign_id: campaignMode === "existing" ? existingCampaignId : undefined,
            objective,
            daily_budget: dailyBudget ? parseInt(dailyBudget) * 100 : undefined,
          },
          ad_set_config: {
            mode: adSetMode,
            name: adSetName,
            ad_set_id: adSetMode === "existing" ? existingAdSetId : undefined,
            placement: buildPlacementConfig(),
            attribution_window: attributionWindow,
            multi_advertiser: multiAdvertiser,
            start_date: startDate || undefined,
            end_date: endDate || undefined,
          },
          ad_preferences: {
            identity_type: identityType,
            landing_url: landingUrl,
            cta,
            primary_texts: primaryTexts.split("\n").filter(Boolean),
            headlines: headlines.split("\n").filter(Boolean),
            launch_status: launchStatus,
            advantage_creative: sanitizeAdvantageCreative(advantageCreative),
          },
          launched_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();
      
      if (launchError) throw launchError;

      const items = selectedVideoData.map(video => ({
        launch_id: launch.id,
        video_id: video.id,
        campaign_id: campaignMode === "existing" ? existingCampaignId : undefined,
        campaign_name: campaignMode === "new" ? campaignName : undefined,
        ad_set_id: adSetMode === "existing" ? existingAdSetId : undefined,
        ad_set_name: adSetMode === "new" ? adSetName : undefined,
        ad_name: generateAdName(video, presets),
        identity_type: identityType,
        primary_text: primaryTexts.split("\n")[0] || "",
        headline: headlines.split("\n")[0] || "",
        landing_url: landingUrl,
        cta,
      }));

      const { error: itemsError } = await supabase.from("ad_launch_items").insert(items);
      if (itemsError) throw itemsError;

      supabase.functions.invoke("launch-meta-ads", { body: { launchId: launch.id } }).catch(console.error);
      return launch;
    },
    onSuccess: (launch) => {
      toast.success(`${selectedVideos.length} ads queued — processing now...`);
      setActiveLaunchId(launch.id);
      setLaunchProgress({ status: "processing", ads_created: 0, total_ads: selectedVideos.length });
    },
    onError: (error) => toast.error("Failed to launch ads: " + error.message),
  });

  const canProceed = () => {
    switch (step) {
      case 0: return selectedVideos.length > 0;
      case 1: {
        if (campaignMode === "new" && !campaignName) return false;
        if (campaignMode === "existing" && !existingCampaignId) return false;
        if (adSetMode === "existing" && !existingAdSetId) return false;
        if (adSetMode === "new" && !adSetName) return false;
        return true;
      }
      case 2: return !!landingUrl;
      case 3: return true;
      default: return false;
    }
  };

  const selectedVideoData = videos?.filter(v => selectedVideos.includes(v.id)) || [];

  const getExistingCampaignName = () => existingCampaigns?.find(c => c.id === existingCampaignId)?.name || "—";
  const getExistingAdSetName = () => existingAdSets?.find(a => a.id === existingAdSetId)?.name || "—";

  return (
    <AdsLayout>
      <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
        {/* Step Indicator */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => i < step && setStep(i)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                i === step ? "bg-primary text-primary-foreground"
                  : i < step ? "bg-primary/10 text-primary cursor-pointer"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              {i < step ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">Step {i + 1}</span>
            </button>
          ))}
        </div>

        {/* Step 1: Select Submissions */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">Select Submissions</h2>
              <p className="text-sm text-muted-foreground">Choose approved creator content to turn into ads</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search by title or video ID..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Select value={creatorFilter} onValueChange={setCreatorFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <User className="w-4 h-4 mr-2" /><SelectValue placeholder="All Creators" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Creators</SelectItem>
                  {creators.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name as string}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={selectAll}>
                {selectedVideos.length === filteredVideos.length ? "Clear All" : "Select All"}
              </Button>
              <p className="text-sm text-muted-foreground">{selectedVideos.length} selected of {filteredVideos.length}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredVideos.map(video => {
                const isSelected = selectedVideos.includes(video.id);
                const creatorName = (video as any).profiles?.full_name || "Unknown";
                const history = launchHistory?.get(video.id);
                const isCurrentlyLive = liveAds?.has(video.id);
                const perf = videoPerformance?.get(video.id);
                const roas = perf && perf.totalSpend > 0 ? (perf.totalRevenue / perf.totalSpend).toFixed(2) : null;

                return (
                  <Card
                    key={video.id}
                    className={cn("stat-card cursor-pointer transition-all", isSelected && "ring-2 ring-primary bg-primary/5")}
                    onClick={() => toggleVideo(video.id)}
                  >
                    <CardContent className="p-3 flex items-start gap-3">
                      <Checkbox checked={isSelected} className="mt-1" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{video.title}</p>
                        <p className="text-xs text-muted-foreground">{creatorName}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{video.unique_video_id}</Badge>
                          <span className="text-[10px] text-muted-foreground">{new Date(video.created_at).toLocaleDateString()}</span>
                        </div>

                        {/* Currently Live Badge */}
                        {isCurrentlyLive && (
                          <div className="mt-2 bg-destructive/10 border border-destructive/30 rounded-md px-2 py-1">
                            <div className="flex items-center gap-1.5">
                              <Zap className="w-3 h-3 text-destructive" />
                              <span className="text-[10px] font-semibold text-destructive">Currently Live</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">This video already has an active ad running</p>
                          </div>
                        )}

                        {/* Previously Launched Badge with metrics */}
                        {history && !isCurrentlyLive && (
                          <div className="mt-2 bg-warning/10 border border-warning/20 rounded-md px-2 py-1">
                            <div className="flex items-center gap-1.5">
                              <TrendingUp className="w-3 h-3 text-warning" />
                              <span className="text-[10px] font-medium text-warning">Previously Launched</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {history.count} time{history.count > 1 ? "s" : ""} • Last: {new Date(history.lastLaunch).toLocaleDateString()}
                              {perf && (
                                <> • Spend: ${perf.totalSpend.toFixed(0)}{roas && ` • ROAS: ${roas}x`}</>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                      {video.thumbnail_url && (
                        <img src={video.thumbnail_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {filteredVideos.length === 0 && !videosLoading && (
              <div className="text-center py-8">
                <Video className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">No approved videos found</p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Campaigns & Ad Sets */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">Campaigns & Ad Sets</h2>
              <p className="text-sm text-muted-foreground">Configure where your ads will live in your Meta account</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="stat-card">
                <CardHeader><CardTitle className="text-base">Campaign</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <RadioGroup value={campaignMode} onValueChange={(v: "existing" | "new") => { setCampaignMode(v); setExistingCampaignId(""); setExistingAdSetId(""); }}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="existing" id="campaign-existing" />
                      <Label htmlFor="campaign-existing">Add to Existing</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="new" id="campaign-new" />
                      <Label htmlFor="campaign-new">New Campaign</Label>
                    </div>
                  </RadioGroup>
                  {campaignMode === "new" && (
                    <div className="space-y-3">
                      <div><Label>Campaign Name</Label><Input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="e.g., UGC Testing - Feb 2026" /></div>
                      <div>
                        <Label>Campaign Objective</Label>
                        <Select value={objective} onValueChange={setObjective}>
                          <SelectTrigger><Target className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {OBJECTIVE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {campaignMode === "existing" && (
                    <div className="space-y-2">
                      <Label>Select Campaign</Label>
                      <Select value={existingCampaignId} onValueChange={(v) => { setExistingCampaignId(v); setExistingAdSetId(""); }}>
                        <SelectTrigger><SelectValue placeholder="Choose a campaign..." /></SelectTrigger>
                        <SelectContent>
                          {existingCampaigns?.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {existingCampaigns?.length === 0 && (
                        <p className="text-xs text-muted-foreground">No campaigns found. Sync your Meta data first from Active Ads.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="stat-card">
                <CardHeader><CardTitle className="text-base">Ad Set</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <RadioGroup value={adSetMode} onValueChange={(v: "existing" | "new") => { setAdSetMode(v); setExistingAdSetId(""); }}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="existing" id="adset-existing" />
                      <Label htmlFor="adset-existing">Add to Existing</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="new" id="adset-new" />
                      <Label htmlFor="adset-new">New Ad Set</Label>
                    </div>
                  </RadioGroup>
                  {adSetMode === "new" && (
                    <div className="space-y-3">
                      <div><Label>Ad Set Name</Label><Input value={adSetName} onChange={e => setAdSetName(e.target.value)} placeholder="e.g., Creator Testing - SarahM" /></div>
                      <div>
                        <Label>Daily Budget ($)</Label>
                        <Input type="number" value={dailyBudget} onChange={e => setDailyBudget(e.target.value)} placeholder="50" min="1" />
                      </div>
                    </div>
                  )}
                  {adSetMode === "existing" && (
                    <div className="space-y-2">
                      <Label>Select Ad Set</Label>
                      {!existingCampaignId && campaignMode === "existing" ? (
                        <p className="text-xs text-muted-foreground">Select a campaign first to see its ad sets.</p>
                      ) : (
                        <Select value={existingAdSetId} onValueChange={setExistingAdSetId}>
                          <SelectTrigger><SelectValue placeholder="Choose an ad set..." /></SelectTrigger>
                          <SelectContent>
                            {existingAdSets?.map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {existingCampaignId && existingAdSets?.length === 0 && (
                        <p className="text-xs text-muted-foreground">No ad sets found in this campaign.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Placements & Attribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="stat-card">
                <CardHeader><CardTitle className="text-base">Placements</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <RadioGroup value={placementMode} onValueChange={(v: "advantage_plus" | "manual") => setPlacementMode(v)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="advantage_plus" id="placement-auto" />
                      <Label htmlFor="placement-auto">Advantage+ Placements (Recommended)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="manual" id="placement-manual" />
                      <Label htmlFor="placement-manual">Manual Placements</Label>
                    </div>
                  </RadioGroup>

                  {placementMode === "manual" && (
                    <div className="space-y-4 pt-2">
                      {Object.entries(MANUAL_PLACEMENTS).map(([platform, positions]) => {
                        const platformLabel = platform === "audience_network" ? "Audience Network"
                          : platform.charAt(0).toUpperCase() + platform.slice(1);
                        return (
                          <div key={platform}>
                            <p className="text-sm font-medium mb-2">{platformLabel}</p>
                            <div className="grid grid-cols-2 gap-2">
                              {positions.map(pos => (
                                <label key={pos.value} className="flex items-center gap-2 text-sm cursor-pointer">
                                  <Checkbox
                                    checked={selectedPlatforms[platform]?.includes(pos.value)}
                                    onCheckedChange={() => togglePlacement(platform, pos.value)}
                                  />
                                  {pos.label}
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="stat-card">
                  <CardHeader><CardTitle className="text-base">Attribution Window</CardTitle></CardHeader>
                  <CardContent>
                    <Select value={attributionWindow} onValueChange={setAttributionWindow}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ATTRIBUTION_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>

                <Card className="stat-card">
                  <CardHeader>
                    <CardTitle className="text-base">Multi-Advertiser Ads</CardTitle>
                    <CardDescription>Allow Meta to show your ad alongside ads from other businesses</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <RadioGroup value={multiAdvertiser ? "on" : "off"} onValueChange={(v) => setMultiAdvertiser(v === "on")}>
                      <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors">
                        <RadioGroupItem value="on" id="multi-on" className="mt-0.5" />
                        <div>
                          <Label htmlFor="multi-on" className="font-medium">On (Default)</Label>
                          <p className="text-xs text-muted-foreground">Meta may show your ad with other brands' ads for better reach</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors">
                        <RadioGroupItem value="off" id="multi-off" className="mt-0.5" />
                        <div>
                          <Label htmlFor="multi-off" className="font-medium">Off</Label>
                          <p className="text-xs text-muted-foreground">Your ad will only appear standalone — no other brands alongside</p>
                        </div>
                      </div>
                    </RadioGroup>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Schedule */}
            <Card className="stat-card">
              <CardHeader>
                <CardTitle className="text-base">Schedule</CardTitle>
                <CardDescription>Leave empty to start immediately with no end date</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Start Date</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
                  <div><Label>End Date (optional)</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
                </div>
              </CardContent>
            </Card>

            <Card className="stat-card bg-primary/5 border-primary/20">
              <CardContent className="p-4">
                <p className="text-sm">
                  <strong>{selectedVideos.length} submissions</strong> × <strong>1 ad set</strong> = <strong>{selectedVideos.length} ads</strong> will be created
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Configure Ads */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">Configure Your Ads</h2>
              <p className="text-sm text-muted-foreground">Set up how your ads will look and where they send traffic</p>
            </div>

            {/* Advantage+ Creative Enhancements */}
            <Card className="stat-card">
              <CardHeader>
                <CardTitle className="text-base">Advantage+ Creative</CardTitle>
                <CardDescription>Meta's AI-powered creative enhancements — toggle on/off</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { key: "ig_video_native_subtitle", label: "Native Subtitles", desc: "Let Meta auto-enable native subtitle rendering when eligible" },
                  { key: "text_overlay_translation", label: "Text Overlay Translation", desc: "Translate and adapt text overlays for more audiences" },
                  { key: "product_metadata_automation", label: "Product Metadata Automation", desc: "Auto-enhance product metadata overlays when supported" },
                  { key: "profile_card", label: "Profile Card", desc: "Allow profile card presentation enhancements where available" },
                ].map(item => (
                  <label key={item.key} className="flex items-start gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer">
                    <Checkbox
                      checked={advantageCreative[item.key] ?? false}
                      onCheckedChange={(checked) => setAdvantageCreative(prev => ({ ...prev, [item.key]: !!checked }))}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </label>
                ))}
              </CardContent>
            </Card>

            <Card className="stat-card">
              <CardHeader>
                <CardTitle className="text-base">Ad Identity</CardTitle>
                <CardDescription>Choose how your ads appear in the feed</CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup value={identityType} onValueChange={setIdentityType}>
                  <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors">
                    <RadioGroupItem value="brand" id="identity-brand" className="mt-0.5" />
                    <div>
                      <Label htmlFor="identity-brand" className="font-medium">Brand Page</Label>
                      <p className="text-xs text-muted-foreground">Ads run from your brand's Facebook and Instagram page</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors">
                    <RadioGroupItem value="partnership" id="identity-partnership" className="mt-0.5" />
                    <div>
                      <Label htmlFor="identity-partnership" className="font-medium">Partnership Ads</Label>
                      <p className="text-xs text-muted-foreground">Ads show the creator's handle — feels more native in the feed</p>
                      <Badge variant="secondary" className="mt-1 text-[10px]">Recommended</Badge>
                    </div>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            <Card className="stat-card">
              <CardHeader>
                <CardTitle className="text-base">Ad Copy</CardTitle>
                <CardDescription>Add primary texts and headlines, or use a saved template</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {copyTemplates && copyTemplates.length > 0 && (
                  <div>
                    <Label>Use Template</Label>
                    <Select onValueChange={(id) => {
                      const t = copyTemplates.find(t => t.id === id);
                      if (t) { setPrimaryTexts(t.primary_texts?.join("\n") || ""); setHeadlines(t.headlines?.join("\n") || ""); }
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select a template..." /></SelectTrigger>
                      <SelectContent>{copyTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div><Label>Primary Texts (up to 5, one per line)</Label><Textarea value={primaryTexts} onChange={e => setPrimaryTexts(e.target.value)} placeholder="Enter primary text variations..." rows={4} /></div>
                <div><Label>Headlines (up to 5, one per line)</Label><Textarea value={headlines} onChange={e => setHeadlines(e.target.value)} placeholder="Enter headline variations..." rows={3} /></div>
              </CardContent>
            </Card>

            <Card className="stat-card">
              <CardHeader>
                <CardTitle className="text-base">Landing Page</CardTitle>
                <CardDescription>{presets?.utm_source ? "UTMs will be auto-applied from your settings" : "Enter the URL where you want to send traffic"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {landingPages && landingPages.length > 0 && (
                  <Select onValueChange={setLandingUrl}>
                    <SelectTrigger><SelectValue placeholder="Select saved URL..." /></SelectTrigger>
                    <SelectContent>{landingPages.map(p => <SelectItem key={p.id} value={p.url}>{p.label} — {p.url}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                <Input value={landingUrl} onChange={e => setLandingUrl(e.target.value)} placeholder="https://yoursite.com/product" />
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="stat-card">
                <CardHeader><CardTitle className="text-base">Call to Action</CardTitle></CardHeader>
                <CardContent>
                  <Select value={cta} onValueChange={setCta}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CTA_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </CardContent>
              </Card>
              <Card className="stat-card">
                <CardHeader><CardTitle className="text-base">Launch Status</CardTitle></CardHeader>
                <CardContent>
                  <RadioGroup value={launchStatus} onValueChange={setLaunchStatus}>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="paused" id="status-paused" /><Label htmlFor="status-paused">Paused (review first)</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="active" id="status-active" /><Label htmlFor="status-active">Active (start immediately)</Label></div>
                  </RadioGroup>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Step 4: Review & Launch */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">Review & Launch</h2>
              <p className="text-sm text-muted-foreground">Review your ads before they go live</p>
            </div>

            <Card className="stat-card bg-primary/5 border-primary/20">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between"><span className="text-sm font-medium">Total Ads</span><Badge>{selectedVideos.length}</Badge></div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Campaign</span>
                  <span className="text-sm">{campaignMode === "new" ? campaignName : getExistingCampaignName()}</span>
                </div>
                {campaignMode === "new" && <div className="flex items-center justify-between"><span className="text-sm font-medium">Objective</span><Badge variant="secondary">{OBJECTIVE_OPTIONS.find(o => o.value === objective)?.label}</Badge></div>}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Ad Set</span>
                  <span className="text-sm">{adSetMode === "new" ? adSetName : getExistingAdSetName()}</span>
                </div>
                {dailyBudget && <div className="flex items-center justify-between"><span className="text-sm font-medium">Daily Budget</span><span className="text-sm">${dailyBudget}</span></div>}
                <div className="flex items-center justify-between"><span className="text-sm font-medium">Placement</span><Badge variant="secondary">{placementMode === "advantage_plus" ? "Advantage+ (Recommended)" : "Manual"}</Badge></div>
                <div className="flex items-center justify-between"><span className="text-sm font-medium">Attribution</span><Badge variant="secondary">{ATTRIBUTION_OPTIONS.find(a => a.value === attributionWindow)?.label}</Badge></div>
                <div className="flex items-center justify-between"><span className="text-sm font-medium">Multi-Advertiser</span><Badge variant={multiAdvertiser ? "secondary" : "default"}>{multiAdvertiser ? "On" : "Off"}</Badge></div>
                <div className="flex items-center justify-between"><span className="text-sm font-medium">Identity</span><Badge variant="secondary">{identityType === "partnership" ? "Partnership Ads" : "Brand Page"}</Badge></div>
                <div className="flex items-center justify-between"><span className="text-sm font-medium">Status</span><Badge variant={launchStatus === "active" ? "default" : "secondary"}>{launchStatus === "active" ? "Active" : "Paused"}</Badge></div>
                {startDate && <div className="flex items-center justify-between"><span className="text-sm font-medium">Schedule</span><span className="text-sm">{startDate}{endDate ? ` → ${endDate}` : " (no end)"}</span></div>}
              </CardContent>
            </Card>

            <div className="space-y-2">
              {selectedVideoData.map(video => {
                const creatorName = (video as any).profiles?.full_name || "Unknown";
                return (
                  <Card key={video.id} className="stat-card">
                    <CardContent className="p-3 flex items-center gap-3">
                      {video.thumbnail_url && <img src={video.thumbnail_url} alt="" className="w-12 h-12 rounded-lg object-cover" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{generateAdName(video, presets)}</p>
                        <p className="text-xs text-muted-foreground">{creatorName}</p>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">{identityType === "partnership" ? "Partnership" : "Brand"}</Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Preflight Errors */}
        {preflightErrors.length > 0 && (
          <Card className="stat-card border-destructive/50 bg-destructive/5">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <span className="text-sm font-semibold text-destructive">Cannot launch — fix these issues first</span>
              </div>
              {preflightErrors.map((err, i) => {
                // Support markdown-style links [text](url)
                const linkMatch = err.match(/\[(.+?)\]\((.+?)\)/);
                if (linkMatch) {
                  const before = err.slice(0, linkMatch.index);
                  const after = err.slice((linkMatch.index || 0) + linkMatch[0].length);
                  return (
                    <p key={i} className="text-xs text-destructive/80 pl-6">
                      • {before}
                      <a href={linkMatch[2]} className="underline font-medium text-destructive hover:text-destructive/70" onClick={(e) => { e.preventDefault(); navigate(linkMatch[2]); }}>
                        {linkMatch[1]}
                      </a>
                      {after}
                    </p>
                  );
                }
                return <p key={i} className="text-xs text-destructive/80 pl-6">• {err}</p>;
              })}
            </CardContent>
          </Card>
        )}

        {/* Preflight Warnings */}
        {preflightWarnings.length > 0 && preflightErrors.length === 0 && (
          <Card className="stat-card border-yellow-500/50 bg-yellow-500/5">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm font-semibold text-yellow-700">Heads up — launching anyway</span>
              </div>
              {preflightWarnings.map((w, i) => (
                <p key={i} className="text-xs text-yellow-600/80 pl-6">• {w}</p>
              ))}
            </CardContent>
          </Card>
        )}


        {activeLaunchId && launchProgress && (
          <Card className="stat-card border-primary/30 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {launchProgress.status === "processing" ? "Creating ads..." :
                   launchProgress.status === "completed" ? "Launch complete!" :
                   launchProgress.status === "failed" ? "Launch failed" : "Pending..."}
                </span>
                <Badge variant={launchProgress.status === "completed" ? "default" : launchProgress.status === "failed" ? "destructive" : "secondary"}>
                  {launchProgress.ads_created}/{launchProgress.total_ads}
                </Badge>
              </div>
              <Progress value={(launchProgress.ads_created / launchProgress.total_ads) * 100} className="h-2" />
              {launchProgress.items && launchProgress.items.error > 0 && (
                <p className="text-xs text-destructive">{launchProgress.items.error} ad(s) failed</p>
              )}
              {/* Show detailed failed items */}
              {(launchProgress as any).failed_items && (launchProgress as any).failed_items.length > 0 && (
                <div className="space-y-1 pt-1">
                  {(launchProgress as any).failed_items.map((item: any, i: number) => (
                    <div key={i} className="text-xs bg-destructive/10 rounded px-2 py-1">
                      <span className="font-medium text-destructive">{item.unique_video_id}</span>
                      <span className="text-muted-foreground ml-1">— {item.error_message || "Unknown error"}</span>
                    </div>
                  ))}
                </div>
              )}
              {(launchProgress.status === "completed" || launchProgress.status === "failed") && (
                <Button variant="outline" size="sm" onClick={() => navigate("/ads")}>View Active Ads</Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : navigate("/ads")}>
            <ArrowLeft className="w-4 h-4 mr-2" />{step > 0 ? "Back" : "Cancel"}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>Continue<ArrowRight className="w-4 h-4 ml-2" /></Button>
          ) : (
            <Button onClick={() => launchAds.mutate()} disabled={launchAds.isPending || !!activeLaunchId} className="bg-gradient-purple">
              <Rocket className="w-4 h-4 mr-2" />{activeLaunchId ? "Launching..." : `Launch ${selectedVideos.length} Ads`}
            </Button>
          )}
        </div>
      </div>
    </AdsLayout>
  );
}

function generateAdName(video: any, presets: any): string {
  const template = presets?.naming_template || "{creator}_{product}_{date}";
  const creatorName = video.profiles?.full_name || "Creator";
  const date = new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" }).replace(" ", "");
  return template
    .replace("{creator}", creatorName.replace(/\s+/g, ""))
    .replace("{product}", video.title?.replace(/\s+/g, "").slice(0, 20) || "Video")
    .replace("{date}", date)
    .replace("{trybeid}", video.unique_video_id || "");
}
