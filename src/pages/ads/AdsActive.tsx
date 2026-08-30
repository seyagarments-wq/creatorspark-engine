import AdsLayout from "@/components/layout/AdsLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Megaphone,
  ChevronRight,
  ChevronDown,
  Search,
  TrendingUp,
  DollarSign,
  Eye,
  RefreshCw,
  PlusCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  MousePointerClick,
  ShoppingCart,
  Target,
  BarChart3,
  Play,
  Film,
  Pause,
  Pencil,
  SquareCheck,
  Copy,
  Archive,
} from "lucide-react";
import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MetaObject {
  id: string;
  object_id: string;
  object_name: string | null;
  level: string;
  status: string | null;
  effective_status: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  objective: string | null;
}

interface AdInsightRow {
  id: string;
  object_id: string;
  object_name: string | null;
  level: string;
  impressions: number | null;
  clicks: number | null;
  spend: number | null;
  conversions: number | null;
  conversion_value: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  reach: number | null;
  date_start: string;
  date_stop: string;
  campaign_id?: string | null;
  adset_id?: string | null;
}

// Combined row: meta_object structure + optional performance overlay
interface CombinedRow {
  object_id: string;
  object_name: string | null;
  level: string;
  status: string | null;
  effective_status: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  daily_budget: number | null;
  // Performance (may be null if no data)
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  conversion_value: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  reach: number | null;
  date_start?: string;
  date_stop?: string;
}

type DatePreset = "today" | "yesterday" | "last_7d" | "last_30d";

const DATE_PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7d", label: "7 Days" },
  { value: "last_30d", label: "30 Days" },
];

const CTA_OPTIONS = [
  "SHOP_NOW", "LEARN_MORE", "SIGN_UP", "SUBSCRIBE", "CONTACT_US",
  "DOWNLOAD", "GET_OFFER", "ORDER_NOW", "BUY_NOW", "WATCH_MORE",
];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-success/15 text-success border-success/30",
  PAUSED: "bg-muted text-muted-foreground border-border",
  ARCHIVED: "bg-muted text-muted-foreground border-border",
  DELETED: "bg-destructive/15 text-destructive border-destructive/30",
  PENDING_REVIEW: "bg-warning/15 text-warning border-warning/30",
  DISAPPROVED: "bg-destructive/15 text-destructive border-destructive/30",
  IN_PROCESS: "bg-warning/15 text-warning border-warning/30",
  WITH_ISSUES: "bg-warning/15 text-warning border-warning/30",
  CAMPAIGN_PAUSED: "bg-muted text-muted-foreground border-border",
  ADSET_PAUSED: "bg-muted text-muted-foreground border-border",
};

const fmt = (val: number | null) => val != null ? `$${val.toFixed(2)}` : "$0.00";
const fmtRoas = (spend: number | null, value: number | null) => {
  if (!spend || spend === 0) return "0.00x";
  return `${((value || 0) / spend).toFixed(2)}x`;
};
const fmtCpa = (spend: number | null, conversions: number | null) => {
  if (!conversions || conversions === 0) return "—";
  return fmt((spend || 0) / conversions);
};
const fmtCpm = (spend: number | null, impressions: number | null) => {
  if (!impressions || impressions === 0) return "$0.00";
  return fmt(((spend || 0) / impressions) * 1000);
};
const fmtCpc = (spend: number | null, clicks: number | null) => {
  if (!clicks || clicks === 0) return "—";
  return fmt((spend || 0) / clicks);
};

function EffectiveStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const colorClass = STATUS_COLORS[status] || "bg-secondary text-secondary-foreground border-border";
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5 font-medium border", colorClass)}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

export default function AdsActive() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set());
  const [datePreset, setDatePreset] = useState<DatePreset>("last_7d");
  const [selectedAd, setSelectedAd] = useState<CombinedRow | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [editDialog, setEditDialog] = useState<{ row: CombinedRow; type: "campaign" | "adset" } | null>(null);
  const [editName, setEditName] = useState("");
  const [editBudget, setEditBudget] = useState("");
  const [adEditMode, setAdEditMode] = useState(false);
  const [adEditName, setAdEditName] = useState("");
  const [adEditPrimaryText, setAdEditPrimaryText] = useState("");
  const [adEditHeadline, setAdEditHeadline] = useState("");
  const [adEditLandingUrl, setAdEditLandingUrl] = useState("");
  const [adEditCta, setAdEditCta] = useState("SHOP_NOW");

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Fetch ALL objects from meta_objects (structure + real status)
  const { data: metaObjects, isLoading: metaLoading } = useQuery({
    queryKey: ["meta-objects-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_objects")
        .select("*")
        .order("object_name", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data || []) as MetaObject[];
    },
  });

  // Fetch performance data from ad_insights for the selected date preset
  const { data: adInsights, isLoading: insightsLoading } = useQuery({
    queryKey: ["active-ads-insights", datePreset],
    queryFn: async () => {
      const fetchLevelRows = async (level: "campaign" | "adset" | "ad") => {
        const pageSize = 1000;
        let from = 0;
        const rows: AdInsightRow[] = [];

        while (true) {
          const { data, error } = await supabase
            .from("ad_insights")
            .select("*")
            .eq("date_preset", datePreset)
            .eq("level", level)
            .order("fetched_at", { ascending: false })
            .range(from, from + pageSize - 1);

          if (error) throw error;

          const batch = (data || []) as AdInsightRow[];
          rows.push(...batch);

          if (batch.length < pageSize) break;
          from += pageSize;
        }

        return rows;
      };

      const [campaignRows, adsetRows, adRows] = await Promise.all([
        fetchLevelRows("campaign"),
        fetchLevelRows("adset"),
        fetchLevelRows("ad"),
      ]);

      return [...campaignRows, ...adsetRows, ...adRows];
    },
  });

  const isLoading = metaLoading || insightsLoading;

  // Build combined rows: meta_objects as source of truth, overlay ad_insights performance
  const combinedRows: CombinedRow[] = (() => {
    const dedupedInsights = (() => {
      const map = new Map<string, AdInsightRow>();
      for (const row of adInsights || []) {
        const key = `${row.level}:${row.object_id}`;
        if (!map.has(key)) map.set(key, row);
      }
      return Array.from(map.values());
    })();

    const insightsMap = new Map<string, AdInsightRow>();
    for (const row of dedupedInsights) {
      insightsMap.set(`${row.object_id}_${row.level}`, row);
    }

    // If meta_objects has data, use it as source of truth
    if (metaObjects && metaObjects.length > 0) {
      return metaObjects.map(obj => {
        const perf = insightsMap.get(`${obj.object_id}_${obj.level}`);
        return {
          object_id: obj.object_id,
          object_name: obj.object_name,
          level: obj.level,
          status: obj.status,
          effective_status: obj.effective_status,
          campaign_id: obj.campaign_id,
          adset_id: obj.adset_id,
          daily_budget: obj.daily_budget,
          spend: perf?.spend || null,
          impressions: perf?.impressions || null,
          clicks: perf?.clicks || null,
          conversions: perf?.conversions || null,
          conversion_value: perf?.conversion_value || null,
          ctr: perf?.ctr || null,
          cpc: perf?.cpc || null,
          cpm: perf?.cpm || null,
          reach: perf?.reach || null,
          date_start: perf?.date_start,
          date_stop: perf?.date_stop,
        };
      });
    }

    // Fallback: build structure from ad_insights when meta_objects is empty
    if (dedupedInsights.length === 0) return [];

    const campaignMap = new Map<string, CombinedRow>();
    const adsetMap = new Map<string, CombinedRow>();
    const adRows: CombinedRow[] = [];

    for (const row of dedupedInsights) {
      const base: CombinedRow = {
        object_id: row.object_id,
        object_name: row.object_name,
        level: row.level,
        status: null,
        effective_status: null,
        campaign_id: row.campaign_id || null,
        adset_id: row.adset_id || null,
        daily_budget: null,
        spend: row.spend,
        impressions: row.impressions,
        clicks: row.clicks,
        conversions: row.conversions,
        conversion_value: row.conversion_value,
        ctr: row.ctr,
        cpc: row.cpc,
        cpm: row.cpm,
        reach: row.reach,
        date_start: row.date_start,
        date_stop: row.date_stop,
      };

      if (row.level === "campaign") {
        campaignMap.set(row.object_id, { ...base, campaign_id: null });
        continue;
      }

      if (row.level === "adset") {
        adsetMap.set(row.object_id, base);
        continue;
      }

      adRows.push(base);

      // Safety fallback only when campaign/adset level rows are absent
      if (row.campaign_id && !campaignMap.has(row.campaign_id)) {
        campaignMap.set(row.campaign_id, {
          object_id: row.campaign_id,
          object_name: row.campaign_id,
          level: "campaign",
          status: null,
          effective_status: null,
          campaign_id: null,
          adset_id: null,
          daily_budget: null,
          spend: null,
          impressions: null,
          clicks: null,
          conversions: null,
          conversion_value: null,
          ctr: null,
          cpc: null,
          cpm: null,
          reach: null,
        });
      }

      if (row.adset_id && !adsetMap.has(row.adset_id)) {
        adsetMap.set(row.adset_id, {
          object_id: row.adset_id,
          object_name: row.adset_id,
          level: "adset",
          status: null,
          effective_status: null,
          campaign_id: row.campaign_id || null,
          adset_id: null,
          daily_budget: null,
          spend: null,
          impressions: null,
          clicks: null,
          conversions: null,
          conversion_value: null,
          ctr: null,
          cpc: null,
          cpm: null,
          reach: null,
        });
      }
    }

    return [...campaignMap.values(), ...adsetMap.values(), ...adRows];
  })();

  const campaigns = combinedRows.filter(r => r.level === "campaign");
  const adSets = combinedRows.filter(r => r.level === "adset");
  const ads = combinedRows.filter(r => r.level === "ad");

  const filteredCampaigns = campaigns.filter(c =>
    !searchQuery || c.object_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getAdSetsForCampaign = (campaignId: string) =>
    adSets.filter(a => a.campaign_id === campaignId);
  const getAdsForAdSet = (adSetId: string) =>
    ads.filter(a => a.adset_id === adSetId);

  const isActive = (row: CombinedRow) => row.effective_status === "ACTIVE";

  // Sync mutation — fetches all campaigns, adsets, ads from Meta and stores in meta_objects
  const syncMutation = useMutation({
    mutationFn: async () => {
      const results: { step: string; ok: boolean }[] = [];

      // Sync structure into meta_objects — continue on partial failure
      for (const type of ["campaigns", "adsets", "ads"]) {
        try {
          const { data, error } = await supabase.functions.invoke("fetch-meta-ads", {
            body: { type },
          });
          if (error) throw error;
          if (data?.error) {
            if (data.code === "TOKEN_EXPIRED") throw new Error("Meta token expired — reconnect in Settings");
            throw new Error(data.error);
          }
          results.push({ step: type, ok: true });
        } catch (err: any) {
          console.error(`Sync ${type} failed:`, err.message);
          results.push({ step: type, ok: false });
          // Token expired is fatal — stop everything
          if (err.message?.includes("token expired")) throw err;
        }
        // Delay between types to avoid rate limits
        await new Promise(r => setTimeout(r, 6000));
      }

      // Sync insights — also continue on partial failure
      for (const level of ["campaign", "adset", "ad"]) {
        try {
          const { data, error } = await supabase.functions.invoke("fetch-ad-insights", {
            body: { level, date_preset: datePreset, store_results: true },
          });
          if (error) throw error;
          if (data?.error && data.code !== "RATE_LIMITED") throw new Error(data.error);
          if (data?.error) throw new Error(data.error);
          results.push({ step: `insights-${level}`, ok: true });
        } catch (err: any) {
          console.error(`Insights ${level} failed:`, err.message);
          results.push({ step: `insights-${level}`, ok: false });
        }
        await new Promise(r => setTimeout(r, 6000));
      }

      return results;
    },
    onSuccess: (results) => {
      // Always invalidate queries so partial data shows
      queryClient.invalidateQueries({ queryKey: ["meta-objects-all"] });
      queryClient.invalidateQueries({ queryKey: ["active-ads-insights"] });

      const succeeded = results.filter(r => r.ok).map(r => r.step);
      const failed = results.filter(r => !r.ok).map(r => r.step);

      if (failed.length === 0) {
        toast.success("Full sync complete!");
      } else if (succeeded.length > 0) {
        toast.warning(`Partial sync: ${succeeded.join(", ")} ✓ | ${failed.join(", ")} rate-limited — retry in 60s`);
      } else {
        toast.error("Sync failed — Meta rate limit. Wait 60s and retry.");
      }
    },
    onError: (e) => {
      // Always invalidate so any partial data shows
      queryClient.invalidateQueries({ queryKey: ["meta-objects-all"] });
      queryClient.invalidateQueries({ queryKey: ["active-ads-insights"] });
      toast.error("Sync failed: " + (e.message || "Unknown error"));
    },
  });

  const manageMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const { data, error } = await supabase.functions.invoke("manage-meta-ads", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-objects-all"] });
      queryClient.invalidateQueries({ queryKey: ["active-ads-insights"] });
    },
  });

  const handleToggleStatus = useCallback(async (row: CombinedRow) => {
    const currentlyActive = isActive(row);
    const newStatus = currentlyActive ? "PAUSED" : "ACTIVE";
    const label = row.object_name || row.object_id;
    try {
      await manageMutation.mutateAsync({ action: "update_status", object_id: row.object_id, status: newStatus });
      toast.success(`${label} ${newStatus === "PAUSED" ? "paused" : "activated"}`);
    } catch (err: any) {
      toast.error(`Failed to update: ${err.message}`);
    }
  }, [manageMutation]);

  const handleBulkAction = useCallback(async (status: "ACTIVE" | "PAUSED" | "ARCHIVED") => {
    if (selectedItems.size === 0) return;
    const items = Array.from(selectedItems);
    const label = status === "PAUSED" ? "Pausing" : status === "ARCHIVED" ? "Archiving" : "Activating";
    toast.info(`${label} ${items.length} items...`);
    let success = 0;
    for (const objectId of items) {
      try {
        await manageMutation.mutateAsync({ action: "update_status", object_id: objectId, status });
        success++;
      } catch { /* continue */ }
    }
    toast.success(`${success}/${items.length} items updated`);
    setSelectedItems(new Set());
  }, [selectedItems, manageMutation]);

  const handleDuplicate = useCallback(async (row: CombinedRow) => {
    const label = row.object_name || row.object_id;
    try {
      await manageMutation.mutateAsync({ action: "duplicate", object_id: row.object_id, status_option: "PAUSED" });
      toast.success(`${label} duplicated (paused)`);
    } catch (err: any) {
      toast.error(`Failed to duplicate: ${err.message}`);
    }
  }, [manageMutation]);

  const handleSaveEdit = useCallback(async () => {
    if (!editDialog) return;
    const { row, type } = editDialog;
    try {
      const payload: Record<string, any> = {
        action: type === "campaign" ? "update_campaign" : "update_adset",
        object_id: row.object_id,
      };
      if (editName && editName !== row.object_name) payload.name = editName;
      if (editBudget) payload.daily_budget = parseFloat(editBudget);
      await manageMutation.mutateAsync(payload);
      toast.success(`${type === "campaign" ? "Campaign" : "Ad Set"} updated`);
      setEditDialog(null);
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    }
  }, [editDialog, editName, editBudget, manageMutation]);

  const handleSaveAdEdit = useCallback(async () => {
    if (!selectedAd) return;
    try {
      const payload: Record<string, any> = {
        action: "update_ad",
        object_id: selectedAd.object_id,
      };
      if (adEditName) payload.name = adEditName;
      if (adEditPrimaryText) payload.primary_text = adEditPrimaryText;
      if (adEditHeadline) payload.headline = adEditHeadline;
      if (adEditLandingUrl) payload.landing_url = adEditLandingUrl;
      if (adEditCta) payload.cta = adEditCta;
      await manageMutation.mutateAsync(payload);
      toast.success("Ad updated");
      setAdEditMode(false);
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    }
  }, [selectedAd, adEditName, adEditPrimaryText, adEditHeadline, adEditLandingUrl, adEditCta, manageMutation]);

  const { data: adVideoData } = useQuery({
    queryKey: ["ad-video-lookup", selectedAd?.object_id],
    enabled: !!selectedAd,
    queryFn: async () => {
      if (!selectedAd) return null;
      const { data: launchItem } = await supabase
        .from("ad_launch_items")
        .select("video_id, videos(video_url, thumbnail_url, title, unique_video_id)")
        .eq("meta_ad_id", selectedAd.object_id)
        .limit(1)
        .maybeSingle();
      if (launchItem?.videos) return launchItem.videos as any;

      const { data: mapping } = await supabase
        .from("meta_ad_mappings")
        .select("video_id, videos:video_id(video_url, thumbnail_url, title, unique_video_id)")
        .eq("meta_ad_id", selectedAd.object_id)
        .limit(1)
        .maybeSingle();
      if (mapping?.videos) return mapping.videos as any;

      const adName = selectedAd.object_name || "";
      const vIdMatch = adName.match(/\bV\d+-\d+\b/i);
      if (vIdMatch) {
        const vId = vIdMatch[0].toUpperCase();
        const { data: videoByVId } = await supabase
          .from("videos")
          .select("video_url, thumbnail_url, title, unique_video_id")
          .eq("unique_video_id", vId)
          .limit(1)
          .maybeSingle();
        if (videoByVId) return videoByVId;
      }
      return null;
    },
  });

  const toggleCampaign = (id: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAdSet = (id: string) => {
    setExpandedAdSets(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectItem = (objectId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      next.has(objectId) ? next.delete(objectId) : next.add(objectId);
      return next;
    });
  };

  const summaryRows = campaigns.length > 0 ? campaigns : adSets.length > 0 ? adSets : ads;
  const totalSpend = summaryRows.reduce((sum, i) => sum + (i.spend || 0), 0);
  const totalImpressions = summaryRows.reduce((sum, i) => sum + (i.impressions || 0), 0);
  const totalValue = summaryRows.reduce((sum, i) => sum + (i.conversion_value || 0), 0);
  const totalClicks = summaryRows.reduce((sum, i) => sum + (i.clicks || 0), 0);
  const totalConversions = summaryRows.reduce((sum, i) => sum + (i.conversions || 0), 0);

  const openEditDialog = (row: CombinedRow, type: "campaign" | "adset") => {
    setEditName(row.object_name || "");
    setEditBudget(row.daily_budget ? String(row.daily_budget) : "");
    setEditDialog({ row, type });
  };

  const openAdEditMode = () => {
    if (!selectedAd) return;
    setAdEditName(selectedAd.object_name || "");
    setAdEditPrimaryText("");
    setAdEditHeadline("");
    setAdEditLandingUrl("");
    setAdEditCta("SHOP_NOW");
    setAdEditMode(true);
  };

  const StatusToggle = ({ row }: { row: CombinedRow }) => {
    const active = isActive(row);
    return (
      <Switch
        checked={active}
        onCheckedChange={() => handleToggleStatus(row)}
        disabled={manageMutation.isPending || row.effective_status === "ARCHIVED"}
        className="scale-75"
        onClick={(e) => e.stopPropagation()}
      />
    );
  };

  const MetricCells = ({ row }: { row: CombinedRow }) => (
    <>
      <TableCell className="text-right font-medium text-sm">{fmt(row.spend)}</TableCell>
      <TableCell className="text-right text-sm">
        <Badge variant={parseFloat(fmtRoas(row.spend, row.conversion_value)) >= 1 ? "default" : "secondary"} className="text-xs">
          {fmtRoas(row.spend, row.conversion_value)}
        </Badge>
      </TableCell>
      <TableCell className="text-right text-sm">{fmtCpa(row.spend, row.conversions)}</TableCell>
      <TableCell className="text-right text-sm">{fmtCpm(row.spend, row.impressions)}</TableCell>
      <TableCell className="text-right text-sm">{fmtCpc(row.spend, row.clicks)}</TableCell>
      <TableCell className="text-right text-sm text-muted-foreground">{(row.clicks || 0).toLocaleString()}</TableCell>
      <TableCell className="text-right text-sm text-muted-foreground">{(row.conversions || 0).toLocaleString()}</TableCell>
      <TableCell className="text-right text-sm text-muted-foreground">{(row.reach || 0).toLocaleString()}</TableCell>
    </>
  );

  return (
    <AdsLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Ads Manager</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage, edit, and control your Meta ads</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {syncMutation.isPending ? (
              <Badge variant="secondary" className="text-xs gap-1"><Loader2 className="w-3 h-3 animate-spin" />Syncing...</Badge>
            ) : syncMutation.isError ? (
              <Badge variant="destructive" className="text-xs gap-1"><XCircle className="w-3 h-3" />
                {syncMutation.error?.message?.includes("RATE_LIMITED") ? "Rate Limited" :
                 syncMutation.error?.message?.includes("expired") ? "Token Expired" : "Sync Error"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs gap-1 text-success border-success/30"><CheckCircle2 className="w-3 h-3" />Connected</Badge>
            )}
            <div className="inline-flex items-center rounded-lg border bg-secondary/30 p-0.5">
              {DATE_PRESET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDatePreset(opt.value)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    datePreset === opt.value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              {syncMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Full Sync
            </Button>
            <Button asChild className="bg-gradient-trybe hover:opacity-90 text-white border-0">
              <Link to="/ads/builder"><PlusCircle className="w-4 h-4 mr-2" />Build Ads</Link>
            </Button>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selectedItems.size > 0 && (
          <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3">
            <SquareCheck className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">{selectedItems.size} selected</span>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => handleBulkAction("ACTIVE")} disabled={manageMutation.isPending}>
              <Play className="w-3.5 h-3.5 mr-1.5" />Activate
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkAction("PAUSED")} disabled={manageMutation.isPending}>
              <Pause className="w-3.5 h-3.5 mr-1.5" />Pause
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkAction("ARCHIVED")} disabled={manageMutation.isPending}>
              <Archive className="w-3.5 h-3.5 mr-1.5" />Archive
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedItems(new Set())}>Clear</Button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1"><DollarSign className="w-4 h-4" /><span className="text-xs font-medium">Spend</span></div>
            <p className="text-xl font-bold">{fmt(totalSpend)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1"><TrendingUp className="w-4 h-4" /><span className="text-xs font-medium">Revenue</span></div>
            <p className="text-xl font-bold">{fmt(totalValue)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1"><Target className="w-4 h-4" /><span className="text-xs font-medium">ROAS</span></div>
            <p className="text-xl font-bold">{fmtRoas(totalSpend, totalValue)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1"><MousePointerClick className="w-4 h-4" /><span className="text-xs font-medium">Clicks</span></div>
            <p className="text-xl font-bold">{totalClicks.toLocaleString()}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1"><ShoppingCart className="w-4 h-4" /><span className="text-xs font-medium">Conversions</span></div>
            <p className="text-xl font-bold">{totalConversions.toLocaleString()}</p>
          </CardContent></Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search campaigns, ad sets, or ads..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
        </div>

        {/* Campaign Hierarchy Table */}
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : filteredCampaigns.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Megaphone className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <h3 className="font-semibold mb-1">No ads found</h3>
              <p className="text-sm text-muted-foreground mb-4">Click "Full Sync" to pull all ads from Meta, or build your first ads.</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                  <RefreshCw className="w-4 h-4 mr-2" />Full Sync
                </Button>
                <Button asChild className="bg-gradient-trybe hover:opacity-90 text-white border-0">
                  <Link to="/ads/builder"><PlusCircle className="w-4 h-4 mr-2" />Build Ads</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="w-12">On/Off</TableHead>
                    <TableHead className="min-w-[220px]">Name</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                    <TableHead className="text-right">CPA</TableHead>
                    <TableHead className="text-right">CPM</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                    <TableHead className="text-right">Reach</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCampaigns.map(campaign => {
                    const isExpanded = expandedCampaigns.has(campaign.object_id);
                    const campaignAdSets = getAdSetsForCampaign(campaign.object_id);

                    return (
                      <>
                        <TableRow key={campaign.object_id} className="cursor-pointer hover:bg-secondary/50 group" onClick={() => toggleCampaign(campaign.object_id)}>
                          <TableCell className="w-10" onClick={e => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedItems.has(campaign.object_id)}
                              onCheckedChange={() => toggleSelectItem(campaign.object_id)}
                            />
                          </TableCell>
                          <TableCell className="w-12" onClick={e => e.stopPropagation()}>
                            <StatusToggle row={campaign} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-medium text-sm truncate">{campaign.object_name || "Unnamed Campaign"}</p>
                                  <EffectiveStatusBadge status={campaign.effective_status} />
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openEditDialog(campaign, "campaign"); }}
                                    className="opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDuplicate(campaign); }}
                                    className="opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity"
                                    title="Duplicate"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                </div>
                                <p className="text-xs text-muted-foreground">Campaign • {campaignAdSets.length} ad sets</p>
                              </div>
                            </div>
                          </TableCell>
                          <MetricCells row={campaign} />
                        </TableRow>

                        {isExpanded && campaignAdSets.map(adSet => {
                          const adSetExpanded = expandedAdSets.has(adSet.object_id);
                          const adSetAds = getAdsForAdSet(adSet.object_id);

                          return (
                            <>
                              <TableRow key={adSet.object_id} className="cursor-pointer bg-secondary/20 hover:bg-secondary/40 group" onClick={(e) => { e.stopPropagation(); toggleAdSet(adSet.object_id); }}>
                                <TableCell className="w-10" onClick={e => e.stopPropagation()}>
                                  <Checkbox
                                    checked={selectedItems.has(adSet.object_id)}
                                    onCheckedChange={() => toggleSelectItem(adSet.object_id)}
                                  />
                                </TableCell>
                                <TableCell className="w-12" onClick={e => e.stopPropagation()}>
                                  <StatusToggle row={adSet} />
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2 pl-4">
                                    {adSetExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-sm font-medium truncate">{adSet.object_name || "Unnamed Ad Set"}</p>
                                        <EffectiveStatusBadge status={adSet.effective_status} />
                                        <button
                                          onClick={(e) => { e.stopPropagation(); openEditDialog(adSet, "adset"); }}
                                          className="opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity"
                                        >
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleDuplicate(adSet); }}
                                          className="opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity"
                                          title="Duplicate"
                                        >
                                          <Copy className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <p className="text-xs text-muted-foreground">
                                        Ad Set • {adSetAds.length} ads
                                        {adSet.daily_budget ? ` • $${adSet.daily_budget}/day` : ""}
                                      </p>
                                    </div>
                                  </div>
                                </TableCell>
                                <MetricCells row={adSet} />
                              </TableRow>

                              {adSetExpanded && adSetAds.map(ad => (
                                <TableRow
                                  key={ad.object_id}
                                  className="bg-secondary/10 cursor-pointer hover:bg-secondary/30 group"
                                  onClick={(e) => { e.stopPropagation(); setSelectedAd(ad); setAdEditMode(false); }}
                                >
                                  <TableCell className="w-10" onClick={e => e.stopPropagation()}>
                                    <Checkbox
                                      checked={selectedItems.has(ad.object_id)}
                                      onCheckedChange={() => toggleSelectItem(ad.object_id)}
                                    />
                                  </TableCell>
                                  <TableCell className="w-12" onClick={e => e.stopPropagation()}>
                                    <StatusToggle row={ad} />
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2 pl-10">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <p className="text-sm truncate">{ad.object_name || "Unnamed Ad"}</p>
                                          <EffectiveStatusBadge status={ad.effective_status} />
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleDuplicate(ad); }}
                                            className="opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity"
                                            title="Duplicate"
                                          >
                                            <Copy className="w-3 h-3" />
                                          </button>
                                        </div>
                                        <p className="text-xs text-muted-foreground">Ad</p>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <MetricCells row={ad} />
                                </TableRow>
                              ))}
                            </>
                          );
                        })}

                        {isExpanded && campaignAdSets.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={11} className="text-center text-xs text-muted-foreground py-3">
                              No ad sets found for this campaign
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        {/* Ad Detail Sheet */}
        <Sheet open={!!selectedAd} onOpenChange={(open) => { if (!open) { setSelectedAd(null); setAdEditMode(false); } }}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {selectedAd?.object_name || "Ad Details"}
                {selectedAd && <EffectiveStatusBadge status={selectedAd.effective_status} />}
              </SheetTitle>
            </SheetHeader>
            {selectedAd && (
              <div className="mt-6 space-y-6">
                {/* Video Preview */}
                {adVideoData ? (
                  <div className="rounded-lg overflow-hidden bg-secondary/30 border">
                    {adVideoData.video_url ? (
                      <video
                        src={adVideoData.video_url}
                        poster={adVideoData.thumbnail_url || undefined}
                        controls
                        className="w-full aspect-video object-cover"
                      />
                    ) : adVideoData.thumbnail_url ? (
                      <div className="relative">
                        <img src={adVideoData.thumbnail_url} alt="" className="w-full aspect-video object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Play className="w-10 h-10 text-white" />
                        </div>
                      </div>
                    ) : null}
                    <div className="p-2">
                      <p className="text-xs text-muted-foreground truncate">{adVideoData.title || adVideoData.unique_video_id}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-secondary/30 border p-6 text-center">
                    <Film className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No creative linked</p>
                  </div>
                )}

                {/* Status toggle */}
                <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Status</p>
                    <p className="text-xs text-muted-foreground">{selectedAd.effective_status || "Unknown"}</p>
                  </div>
                  <StatusToggle row={selectedAd} />
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  {!adEditMode && (
                    <>
                      <Button variant="outline" size="sm" className="flex-1" onClick={openAdEditMode}>
                        <Pencil className="w-4 h-4 mr-2" />Edit
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => handleDuplicate(selectedAd)}>
                        <Copy className="w-4 h-4 mr-2" />Duplicate
                      </Button>
                    </>
                  )}
                </div>

                {adEditMode && (
                  <div className="space-y-4 p-4 border rounded-lg bg-secondary/20">
                    <h4 className="text-sm font-semibold">Edit Ad</h4>
                    <div className="space-y-2">
                      <Label className="text-xs">Ad Name</Label>
                      <Input value={adEditName} onChange={e => setAdEditName(e.target.value)} placeholder="Ad name" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Primary Text</Label>
                      <Textarea value={adEditPrimaryText} onChange={e => setAdEditPrimaryText(e.target.value)} placeholder="Primary text (body copy)" rows={3} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Headline</Label>
                      <Input value={adEditHeadline} onChange={e => setAdEditHeadline(e.target.value)} placeholder="Headline" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Landing URL</Label>
                      <Input value={adEditLandingUrl} onChange={e => setAdEditLandingUrl(e.target.value)} placeholder="https://..." />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">CTA Button</Label>
                      <Select value={adEditCta} onValueChange={setAdEditCta}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CTA_OPTIONS.map(cta => (
                            <SelectItem key={cta} value={cta}>{cta.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveAdEdit} disabled={manageMutation.isPending} className="flex-1">
                        {manageMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAdEditMode(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {selectedAd.date_start && (
                  <div className="text-xs text-muted-foreground">
                    {selectedAd.date_start} — {selectedAd.date_stop}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <DetailCard label="Spend" value={fmt(selectedAd.spend)} icon={<DollarSign className="w-4 h-4" />} />
                  <DetailCard label="ROAS" value={fmtRoas(selectedAd.spend, selectedAd.conversion_value)} icon={<TrendingUp className="w-4 h-4" />} />
                  <DetailCard label="CPA" value={fmtCpa(selectedAd.spend, selectedAd.conversions)} icon={<Target className="w-4 h-4" />} />
                  <DetailCard label="CPM" value={fmtCpm(selectedAd.spend, selectedAd.impressions)} icon={<BarChart3 className="w-4 h-4" />} />
                  <DetailCard label="CPC" value={fmtCpc(selectedAd.spend, selectedAd.clicks)} icon={<MousePointerClick className="w-4 h-4" />} />
                  <DetailCard label="Clicks" value={(selectedAd.clicks || 0).toLocaleString()} icon={<MousePointerClick className="w-4 h-4" />} />
                  <DetailCard label="Conversions" value={(selectedAd.conversions || 0).toLocaleString()} icon={<ShoppingCart className="w-4 h-4" />} />
                  <DetailCard label="Reach" value={(selectedAd.reach || 0).toLocaleString()} icon={<Eye className="w-4 h-4" />} />
                </div>
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Impressions</span>
                    <span className="font-medium">{(selectedAd.impressions || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Campaign / Ad Set Edit Dialog */}
        <Dialog open={!!editDialog} onOpenChange={(open) => !open && setEditDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit {editDialog?.type === "campaign" ? "Campaign" : "Ad Set"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-sm">Name</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Daily Budget ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  value={editBudget}
                  onChange={e => setEditBudget(e.target.value)}
                  placeholder="Leave empty to keep current"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditDialog(null)}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={manageMutation.isPending}>
                {manageMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdsLayout>
  );
}

function DetailCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-secondary/50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
