import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, AlertCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MetaConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnectionChange: () => void;
}

interface MetaCredentials {
  id: string;
  access_token: string | null;
  ad_account_id: string | null;
  page_id: string | null;
  default_link: string | null;
  status: string;
  connected_at: string | null;
  expires_at: string | null;
}

export function MetaConnectionDialog({
  open,
  onOpenChange,
  onConnectionChange,
}: MetaConnectionDialogProps) {
  const [accessToken, setAccessToken] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [pageId, setPageId] = useState("");
  const [defaultLink, setDefaultLink] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testMessage, setTestMessage] = useState("");
  const [existingCredentials, setExistingCredentials] = useState<MetaCredentials | null>(null);

  useEffect(() => {
    if (open) {
      fetchExistingCredentials();
    }
  }, [open]);

  async function fetchExistingCredentials() {
    const { data, error } = await supabase
      .from("meta_credentials")
      .select("*")
      .limit(1)
      .single();

    if (data && !error) {
      setExistingCredentials(data);
      setAdAccountId(data.ad_account_id || "");
      setPageId(data.page_id || "");
      setDefaultLink(data.default_link || "");
      // Don't pre-fill the token for security
    }
  }

  async function handleTestConnection() {
    if (!accessToken || !adAccountId) {
      toast.error("Please enter both access token and ad account ID");
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      // Test the connection by making a simple API call to Meta
      const response = await fetch(
        `https://graph.facebook.com/v19.0/act_${adAccountId.replace("act_", "")}?fields=name,account_status&access_token=${accessToken}`
      );
      
      const data = await response.json();

      if (data.error) {
        setTestResult("error");
        setTestMessage(data.error.message || "Invalid credentials");
      } else {
        setTestResult("success");
        setTestMessage(`Connected to: ${data.name}`);
      }
    } catch (error) {
      setTestResult("error");
      setTestMessage("Failed to connect to Meta API");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    const formattedAccountId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

    // New connection requires token + account ID
    if (!existingCredentials && (!accessToken || !adAccountId)) {
      toast.error("Please enter both access token and ad account ID");
      return;
    }

    // Existing connection requires at least account ID
    if (existingCredentials && !adAccountId) {
      toast.error("Ad Account ID is required");
      return;
    }

    setSaving(true);

    try {
      if (existingCredentials && !accessToken) {
        // Partial update — only save non-token fields
        const { error } = await supabase
          .from("meta_credentials")
          .update({
            ad_account_id: formattedAccountId,
            page_id: pageId || null,
            default_link: defaultLink || null,
          })
          .eq("id", existingCredentials.id);

        if (error) throw error;
      } else {
        // Full update (new connection or token refresh)
        const credentialsData = {
          access_token: accessToken,
          ad_account_id: formattedAccountId,
          page_id: pageId || null,
          default_link: defaultLink || null,
          status: "connected",
          connected_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        };

        if (existingCredentials) {
          const { error } = await supabase
            .from("meta_credentials")
            .update(credentialsData)
            .eq("id", existingCredentials.id);

          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("meta_credentials")
            .insert(credentialsData);

          if (error) throw error;
        }
      }

      toast.success("Meta Ads connection updated successfully");
      onConnectionChange();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving credentials:", error);
      toast.error("Failed to save credentials");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!existingCredentials) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from("meta_credentials")
        .update({
          access_token: null,
          status: "disconnected",
          connected_at: null,
        })
        .eq("id", existingCredentials.id);

      if (error) throw error;

      toast.success("Meta Ads disconnected");
      setExistingCredentials(null);
      setAccessToken("");
      setAdAccountId("");
      setPageId("");
      setDefaultLink("");
      setTestResult(null);
      onConnectionChange();
    } catch (error) {
      console.error("Error disconnecting:", error);
      toast.error("Failed to disconnect");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96C18.34 21.21 22 17.06 22 12.06C22 6.53 17.5 2.04 12 2.04Z" />
            </svg>
            Meta Ads Integration
          </DialogTitle>
          <DialogDescription>
            Connect your Meta Ads account to export videos and track performance automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {existingCredentials?.status === "connected" && (
            <div className="flex items-center gap-2 p-3 bg-success/10 rounded-lg border border-success/20">
              <CheckCircle className="w-5 h-5 text-success" />
              <div className="flex-1">
                <p className="text-sm font-medium">Connected</p>
                <p className="text-xs text-muted-foreground">
                  Account: {existingCredentials.ad_account_id}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleDisconnect} disabled={saving}>
                Disconnect
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="adAccountId">Ad Account ID</Label>
            <Input
              id="adAccountId"
              placeholder="act_123456789"
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Find this in Meta Business Suite under Ad Accounts
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accessToken">Access Token</Label>
            <Input
              id="accessToken"
              type="password"
              placeholder="Enter your access token"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Use a System User token for long-term access.{" "}
              <a
                href="https://developers.facebook.com/docs/marketing-api/access"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Learn more <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pageId">Facebook Page ID (Required for Ads)</Label>
            <Input
              id="pageId"
              placeholder="123456789"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Required to launch ads — used in ad creative setup
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultLink">Default Ad Link (Optional)</Label>
            <Input
              id="defaultLink"
              placeholder="https://your-website.com"
              value={defaultLink}
              onChange={(e) => setDefaultLink(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Destination URL for ad creatives
            </p>
          </div>

          {testResult && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg border ${
                testResult === "success"
                  ? "bg-success/10 border-success/20 text-success"
                  : "bg-destructive/10 border-destructive/20 text-destructive"
              }`}
            >
              {testResult === "success" ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              <span className="text-sm">{testMessage}</span>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
            <AlertCircle className="w-4 h-4 mt-0.5 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">
              <p className="font-medium mb-1">Required Permissions:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>ads_management (upload videos, create ads)</li>
                <li>ads_read (read performance data)</li>
                <li>business_management (access ad accounts)</li>
              </ul>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing || !accessToken || !adAccountId}
          >
            {testing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              "Test Connection"
            )}
          </Button>
          <Button onClick={handleSave} disabled={saving || (!accessToken && !existingCredentials) || !adAccountId}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : existingCredentials?.status === "connected" ? (
              "Update Connection"
            ) : (
              "Connect"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
