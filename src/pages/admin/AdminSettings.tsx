import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Bell, DollarSign, Shield, Save, Loader2, CheckCircle, AlertTriangle, Trash2, RotateCcw, Bomb, Globe, BarChart3, Send, Megaphone, Sticker } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/hooks/use-settings";
import { MetaConnectionDialog } from "@/components/admin/MetaConnectionDialog";
import { StickerPackManager } from "@/components/admin/StickerPackManager";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function AdminSettings() {
  const { settings, loading, saveAllSettings } = useSettings();
  const [localSettings, setLocalSettings] = useState({
        defaultCommission: 10,
    bronzeCommission: 10,
    silverCommission: 12,
    goldCommission: 13,
    platinumCommission: 15,
    autoApproveVideos: false,
    emailNotifications: true,
    payoutThreshold: 50,
    requireVideoReview: true,
  });
  const [saving, setSaving] = useState(false);
  const [metaDialogOpen, setMetaDialogOpen] = useState(false);
  const [metaStatus, setMetaStatus] = useState<"connected" | "disconnected" | "loading">("loading");
  const [resettingCreators, setResettingCreators] = useState(false);
  const [deletingVideos, setDeletingVideos] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [resetAllConfirmText, setResetAllConfirmText] = useState("");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [creatorMetrics, setCreatorMetrics] = useState({
    impressions: true,
    link_clicks: true,
    link_ctr: false,
    conversions: true,
    aov: false,
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resetAllDialogOpen, setResetAllDialogOpen] = useState(false);
  const [broadcastSubject, setBroadcastSubject] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastTarget, setBroadcastTarget] = useState<"all" | "cohort">("all");
  const [broadcastCohortId, setBroadcastCohortId] = useState("");
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [cohorts, setCohorts] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetchMetaStatus();
    fetchCohorts();
  }, []);

  async function fetchCohorts() {
    const { data } = await supabase.from("creator_cohorts").select("id, name").order("name");
    if (data) setCohorts(data);
  }

  async function fetchMetaStatus() {
    try {
      const { data, error } = await supabase
        .from("meta_credentials")
        .select("status")
        .limit(1)
        .single();

      if (data && !error && data.status === "connected") {
        setMetaStatus("connected");
      } else {
        setMetaStatus("disconnected");
      }
    } catch {
      setMetaStatus("disconnected");
    }
  }

  useEffect(() => {
    if (!loading) {
      setLocalSettings({
        defaultCommission: settings.commission.default,
        bronzeCommission: settings.commission.bronze,
        silverCommission: settings.commission.silver,
        goldCommission: settings.commission.gold,
        platinumCommission: settings.commission.platinum,
        autoApproveVideos: settings.video_review.auto_approve,
        emailNotifications: settings.notifications.email_enabled,
        payoutThreshold: settings.payout_threshold.minimum,
        requireVideoReview: settings.video_review.require_review,
      });
      if (settings.analytics) {
        setTimezone(settings.analytics.timezone);
        setCreatorMetrics(settings.analytics.creator_metrics);
      }
    }
  }, [loading, settings]);

  async function handleSave() {
    setSaving(true);
    
    const success = await saveAllSettings({
      commission: {
        default: localSettings.defaultCommission,
        bronze: localSettings.bronzeCommission,
        silver: localSettings.silverCommission,
        gold: localSettings.goldCommission,
        platinum: localSettings.platinumCommission,
      },
      payout_threshold: {
        minimum: localSettings.payoutThreshold,
      },
      video_review: {
        auto_approve: localSettings.autoApproveVideos,
        require_review: localSettings.requireVideoReview,
      },
      notifications: {
        email_enabled: localSettings.emailNotifications,
      },
      analytics: {
        timezone,
        creator_metrics: creatorMetrics,
      },
    });

    if (success) {
      toast.success("Settings saved successfully");
    } else {
      toast.error("Failed to save settings");
    }
    setSaving(false);
  }

  async function handleResetCreators() {
    setResettingCreators(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-platform", {
        body: { action: "reset_creators" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("All creator stats have been reset to zero");
      setResetConfirmText("");
      setResetDialogOpen(false);
    } catch (error: any) {
      console.error("Reset creators error:", error);
      toast.error(error.message || "Failed to reset creator stats");
    } finally {
      setResettingCreators(false);
    }
  }

  async function handleDeleteAllVideos() {
    setDeletingVideos(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-platform", {
        body: { action: "delete_videos" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(data?.message || "All videos deleted");
      setDeleteConfirmText("");
      setDeleteDialogOpen(false);
    } catch (error: any) {
      console.error("Delete videos error:", error);
      toast.error(error.message || "Failed to delete videos");
    } finally {
      setDeletingVideos(false);
    }
  }

  async function handleResetEverything() {
    setResettingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-platform", {
        body: { action: "reset_all" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(data?.message || "Platform fully reset");
      setResetAllConfirmText("");
      setResetAllDialogOpen(false);
    } catch (error: any) {
      console.error("Reset all error:", error);
      toast.error(error.message || "Failed to reset platform");
    } finally {
      setResettingAll(false);
    }
  }

  async function handleSendBroadcast() {
    if (!broadcastSubject.trim() || !broadcastMessage.trim()) {
      toast.error("Subject and message are required");
      return;
    }
    setSendingBroadcast(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-broadcast-email", {
        body: {
          subject: broadcastSubject,
          message: broadcastMessage,
          target: broadcastTarget,
          cohort_id: broadcastTarget === "cohort" ? broadcastCohortId : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Broadcast sent to ${data?.sent || 0} creator${(data?.sent || 0) !== 1 ? "s" : ""}`);
      setBroadcastSubject("");
      setBroadcastMessage("");
    } catch (err: any) {
      toast.error(err.message || "Failed to send broadcast");
    } finally {
      setSendingBroadcast(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-6 max-w-4xl">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your platform configuration</p>
        </div>

        {/* Commission Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Commission Settings
            </CardTitle>
            <CardDescription>Configure creator commission rates by tier</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="defaultCommission">Default Rate (%)</Label>
                <Input
                  id="defaultCommission"
                  type="number"
                  min="0"
                  max="100"
                  value={localSettings.defaultCommission}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, defaultCommission: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground">For new creators</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bronzeCommission">Bronze Tier (%)</Label>
                <Input
                  id="bronzeCommission"
                  type="number"
                  min="0"
                  max="100"
                  value={localSettings.bronzeCommission}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, bronzeCommission: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground">0–74 approved videos</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="silverCommission">Silver Tier (%)</Label>
                <Input
                  id="silverCommission"
                  type="number"
                  min="0"
                  max="100"
                  value={localSettings.silverCommission}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, silverCommission: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground">75–149 approved videos</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="goldCommission">Gold Tier (%)</Label>
                <Input
                  id="goldCommission"
                  type="number"
                  min="0"
                  max="100"
                  value={localSettings.goldCommission}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, goldCommission: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground">150–249 approved videos</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="platinumCommission">Platinum Tier (%)</Label>
                <Input
                  id="platinumCommission"
                  type="number"
                  min="0"
                  max="100"
                  value={localSettings.platinumCommission}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, platinumCommission: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground">250+ approved videos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payout Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Payout Settings
            </CardTitle>
            <CardDescription>Configure payment thresholds</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="threshold">Minimum Payout Threshold ($)</Label>
              <Input
                id="threshold"
                type="number"
                min="0"
                value={localSettings.payoutThreshold}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, payoutThreshold: parseInt(e.target.value) || 0 })
                }
              />
              <p className="text-xs text-muted-foreground">
                Minimum amount before creator can request payout
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Video Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Video Review
            </CardTitle>
            <CardDescription>Configure video submission settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Require Manual Review</Label>
                <p className="text-sm text-muted-foreground">
                  All videos must be reviewed before going live
                </p>
              </div>
              <Switch
                checked={localSettings.requireVideoReview}
                onCheckedChange={(checked) =>
                  setLocalSettings({ ...localSettings, requireVideoReview: checked })
                }
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-Approve Verified Creators</Label>
                <p className="text-sm text-muted-foreground">
                  Skip review for creators with 5+ approved videos
                </p>
              </div>
              <Switch
                checked={localSettings.autoApproveVideos}
                onCheckedChange={(checked) =>
                  setLocalSettings({ ...localSettings, autoApproveVideos: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications
            </CardTitle>
            <CardDescription>Configure admin notification preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive email alerts for new submissions and payouts
                </p>
              </div>
              <Switch
                checked={localSettings.emailNotifications}
                onCheckedChange={(checked) =>
                  setLocalSettings({ ...localSettings, emailNotifications: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Integrations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Integrations
            </CardTitle>
            <CardDescription>Connect external services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#1877F2] flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96C18.34 21.21 22 17.06 22 12.06C22 6.53 17.5 2.04 12 2.04Z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">Meta Ads</p>
                    {metaStatus === "loading" ? (
                      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    ) : metaStatus === "connected" ? (
                      <Badge variant="outline" className="text-success border-success/30 bg-success/10">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Not connected
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">Export videos & sync performance data</p>
                </div>
              </div>
              <Button 
                variant={metaStatus === "connected" ? "outline" : "default"}
                onClick={() => setMetaDialogOpen(true)}
              >
                {metaStatus === "connected" ? "Manage" : "Connect"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <MetaConnectionDialog
          open={metaDialogOpen}
          onOpenChange={setMetaDialogOpen}
          onConnectionChange={fetchMetaStatus}
        />

        {/* Analytics Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Analytics Settings
            </CardTitle>
            <CardDescription>Configure timezone, sync analytics, and manage creator-visible metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Timezone */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <Label className="font-medium">Timezone</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Your timezone will be used to display location accurate analytics dates and time in the portal
              </p>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                  <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                  <SelectItem value="Europe/London">London (GMT)</SelectItem>
                  <SelectItem value="Europe/Berlin">Berlin (CET)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                  <SelectItem value="Australia/Sydney">Sydney (AEST)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Creator-visible metrics */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-medium">Select metrics</Label>
                <button
                  className="text-sm text-primary hover:underline"
                  onClick={() => setCreatorMetrics({
                    impressions: true,
                    link_clicks: true,
                    link_ctr: true,
                    conversions: true,
                    aov: true,
                  })}
                >
                  Select All
                </button>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Engagement Metrics</p>
                <div className="space-y-3 mt-2">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={creatorMetrics.impressions}
                      onCheckedChange={(checked) => setCreatorMetrics(prev => ({ ...prev, impressions: !!checked }))}
                    />
                    <div>
                      <span className="text-sm font-medium">Impressions</span>
                      <span className="text-sm text-muted-foreground ml-2">Total ad impressions</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={creatorMetrics.link_clicks}
                      onCheckedChange={(checked) => setCreatorMetrics(prev => ({ ...prev, link_clicks: !!checked }))}
                    />
                    <div>
                      <span className="text-sm font-medium">Link Clicks</span>
                      <span className="text-sm text-muted-foreground ml-2">Clicks on ad links</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={creatorMetrics.link_ctr}
                      onCheckedChange={(checked) => setCreatorMetrics(prev => ({ ...prev, link_ctr: !!checked }))}
                    />
                    <div>
                      <span className="text-sm font-medium">Link CTR</span>
                      <span className="text-sm text-muted-foreground ml-2">Link click-through rate (link clicks / impressions)</span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sales Metrics</p>
                <div className="space-y-3 mt-2">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={creatorMetrics.conversions}
                      onCheckedChange={(checked) => setCreatorMetrics(prev => ({ ...prev, conversions: !!checked }))}
                    />
                    <div>
                      <span className="text-sm font-medium">Conversions</span>
                      <span className="text-sm text-muted-foreground ml-2">Number of purchases</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={creatorMetrics.aov}
                      onCheckedChange={(checked) => setCreatorMetrics(prev => ({ ...prev, aov: !!checked }))}
                    />
                    <div>
                      <span className="text-sm font-medium">AOV</span>
                      <span className="text-sm text-muted-foreground ml-2">Average order value</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground flex items-start gap-2">
                <span>👉</span>
                <span>Cost metrics (spend, CPA, CPC, CPM) and revenue metrics (GMV, ROAS) are never shown to creators</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>Destructive actions that cannot be undone</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Reset Creators */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border border-destructive/30 rounded-lg bg-destructive/5">
              <div>
                <p className="font-medium text-sm sm:text-base">Reset All Creator Stats</p>
                <p className="text-sm text-muted-foreground">
                  Reset XP, levels, streaks, challenge progress, payouts, and bounties for all creators
                </p>
              </div>
              <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset All Creator Stats?</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <p>This will permanently reset for <strong>all creators</strong>:</p>
                      <ul className="list-disc list-inside text-sm space-y-1">
                        <li>XP and levels back to 0/Level 1</li>
                        <li>Current and longest streaks</li>
                        <li>Weekly challenge progress</li>
                        <li>All payout records</li>
                        <li>All bounty progress</li>
                      </ul>
                      <p className="text-destructive font-medium pt-2">This action cannot be undone.</p>
                      <div className="pt-2">
                        <Label>Type "RESET" to confirm:</Label>
                        <Input 
                          className="mt-1" 
                          value={resetConfirmText}
                          onChange={(e) => setResetConfirmText(e.target.value)}
                          placeholder="RESET"
                        />
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setResetConfirmText("")}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={resetConfirmText !== "RESET" || resettingCreators}
                      onClick={handleResetCreators}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      {resettingCreators ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4 mr-2" />
                      )}
                      Reset All Stats
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Delete All Videos */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border border-destructive/30 rounded-lg bg-destructive/5">
              <div>
                <p className="font-medium text-sm sm:text-base">Delete All Videos</p>
                <p className="text-sm text-muted-foreground">
                  Permanently delete all uploaded videos and their performance data
                </p>
              </div>
              <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete All Videos?</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <p>This will permanently delete:</p>
                      <ul className="list-disc list-inside text-sm space-y-1">
                        <li>All video records from the database</li>
                        <li>All performance/analytics data</li>
                        <li>All video files from storage</li>
                      </ul>
                      <p className="text-destructive font-medium pt-2">This action cannot be undone.</p>
                      <div className="pt-2">
                        <Label>Type "DELETE" to confirm:</Label>
                        <Input 
                          className="mt-1" 
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          placeholder="DELETE"
                        />
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDeleteConfirmText("")}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={deleteConfirmText !== "DELETE" || deletingVideos}
                      onClick={handleDeleteAllVideos}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      {deletingVideos ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-2" />
                      )}
                      Delete All Videos
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Reset Everything */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-2 border-destructive rounded-lg bg-destructive/10">
              <div>
                <p className="font-medium text-sm sm:text-base text-destructive">Reset Entire Platform</p>
                <p className="text-sm text-muted-foreground">
                  Delete ALL videos, reset ALL creator stats, earnings, and progress to zero
                </p>
              </div>
              <AlertDialog open={resetAllDialogOpen} onOpenChange={setResetAllDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="font-bold">
                    <Bomb className="w-4 h-4 mr-2" />
                    Reset Everything
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-destructive">⚠️ FULL PLATFORM RESET</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <p className="font-medium">This will permanently delete and reset:</p>
                      <ul className="list-disc list-inside text-sm space-y-1">
                        <li>All video submissions and files</li>
                        <li>All performance/analytics data</li>
                        <li>All creator XP, levels, and streaks</li>
                        <li>All earnings and payout records</li>
                        <li>All bounty and challenge progress</li>
                        <li>Reset video counts on all profiles</li>
                      </ul>
                      <p className="text-destructive font-bold pt-2">⚠️ THIS CANNOT BE UNDONE!</p>
                      <div className="pt-2">
                        <Label>Type "RESET EVERYTHING" to confirm:</Label>
                        <Input 
                          className="mt-1" 
                          value={resetAllConfirmText}
                          onChange={(e) => setResetAllConfirmText(e.target.value)}
                          placeholder="RESET EVERYTHING"
                        />
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setResetAllConfirmText("")}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={resetAllConfirmText !== "RESET EVERYTHING" || resettingAll}
                      onClick={handleResetEverything}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      {resettingAll ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Bomb className="w-4 h-4 mr-2" />
                      )}
                      Reset Everything
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>

        {/* Admin Broadcast Email */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5" />
              Broadcast Email
            </CardTitle>
            <CardDescription>Send a one-time email blast to all creators or a specific group</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Target Audience</Label>
              <Select
                value={broadcastTarget}
                onValueChange={(v) => setBroadcastTarget(v as "all" | "cohort")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Creators</SelectItem>
                  <SelectItem value="cohort">Specific Cohort</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {broadcastTarget === "cohort" && (
              <div className="space-y-2">
                <Label>Cohort</Label>
                <Select value={broadcastCohortId} onValueChange={setBroadcastCohortId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a cohort..." />
                  </SelectTrigger>
                  <SelectContent>
                    {cohorts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="broadcastSubject">Subject</Label>
              <Input
                id="broadcastSubject"
                placeholder="🚀 Big announcement!"
                value={broadcastSubject}
                onChange={(e) => setBroadcastSubject(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="broadcastMessage">Message</Label>
              <Textarea
                id="broadcastMessage"
                placeholder="Write your message to creators..."
                rows={4}
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
              />
            </div>

            <Button
              onClick={handleSendBroadcast}
              disabled={sendingBroadcast || !broadcastSubject.trim() || !broadcastMessage.trim() || (broadcastTarget === "cohort" && !broadcastCohortId)}
              className="w-full sm:w-auto"
            >
              {sendingBroadcast ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {sendingBroadcast ? "Sending..." : "Send Broadcast"}
            </Button>
          </CardContent>
        </Card>

        {/* Sticker Packs */}
        <StickerPackManager />

        {/* Save Button */}
        <div className="flex justify-end sticky bottom-20 lg:bottom-4 z-10">
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto shadow-lg">
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
