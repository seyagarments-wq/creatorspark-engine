import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Instagram,
  Loader2,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  Shield,
  Unlink,
} from "lucide-react";
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

interface InstagramStatus {
  connected: boolean;
  username?: string;
  connectedAt?: string;
  partnershipAdsEnabled?: boolean;
}

export function InstagramConnection() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<InstagramStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    checkStatus();
    handleOAuthCallback();
  }, []);

  async function checkStatus() {
    try {
      const { data, error } = await supabase.functions.invoke("instagram-oauth", {
        body: { action: "check_status" },
      });

      if (error) throw error;
      setStatus({
        connected: data.connected,
        username: data.username,
        connectedAt: data.connectedAt,
        partnershipAdsEnabled: data.partnershipAdsEnabled,
      });
    } catch (error) {
      console.error("Error checking Instagram status:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuthCallback() {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      toast({
        title: "Instagram connection cancelled",
        description: "You cancelled the Instagram authorization.",
        variant: "destructive",
      });
      // Clean up URL params
      setSearchParams({});
      return;
    }

    if (code && state) {
      setConnecting(true);
      try {
        const redirectUri = `${window.location.origin}/creator/profile`;

        const { data, error: exchangeError } = await supabase.functions.invoke(
          "instagram-oauth",
          {
            body: {
              action: "exchange_code",
              code,
              redirectUri,
            },
          }
        );

        if (exchangeError) throw exchangeError;

        if (data.success) {
          toast({
            title: "Instagram connected!",
            description: `@${data.username} is now connected for Partnership Ads`,
          });
          setStatus({
            connected: true,
            username: data.username,
            connectedAt: new Date().toISOString(),
            partnershipAdsEnabled: true,
          });
        } else if (data.error) {
          throw new Error(data.message || data.error);
        }
      } catch (error: any) {
        console.error("OAuth callback error:", error);
        toast({
          title: "Connection failed",
          description: error.message || "Failed to connect Instagram",
          variant: "destructive",
        });
      } finally {
        setConnecting(false);
        // Clean up URL params
        setSearchParams({});
      }
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/creator/profile`;

      const { data, error } = await supabase.functions.invoke("instagram-oauth", {
        body: {
          action: "get_auth_url",
          redirectUri,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: "Setup required",
          description: data.message || "Instagram OAuth is not configured yet.",
          variant: "destructive",
        });
        setConnecting(false);
        return;
      }

      // Redirect to Meta OAuth
      window.location.href = data.authUrl;
    } catch (error: any) {
      console.error("Error initiating OAuth:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to start Instagram connection",
        variant: "destructive",
      });
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("instagram-oauth", {
        body: { action: "disconnect" },
      });

      if (error) throw error;

      toast({
        title: "Instagram disconnected",
        description: "Your Instagram account has been unlinked.",
      });
      setStatus({ connected: false });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to disconnect Instagram",
        variant: "destructive",
      });
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-card rounded-xl border p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Loading Instagram status...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border p-6">
      <div className="flex items-center gap-3 mb-2">
        <Instagram className="w-6 h-6 text-pink-500" />
        <h2 className="text-lg font-semibold">Instagram Partnership Ads</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Connect your Instagram to enable brands to run Partnership Ads featuring your content
      </p>

      {status.connected ? (
        <>
          {/* Connected state */}
          <div className="bg-success/10 border border-success/20 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-success shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-success">Instagram connected</p>
                <p className="text-sm text-muted-foreground truncate">
                  @{status.username}
                  {status.partnershipAdsEnabled && (
                    <span className="ml-2 text-success">• Partnership Ads enabled</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Benefits */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3 mb-6">
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-primary mt-0.5" />
              <p className="text-sm">
                Your account is verified for authentic Partnership Ads
              </p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-success mt-0.5" />
              <p className="text-sm">
                Brands can promote your videos with proper creator attribution
              </p>
            </div>
            <div className="flex items-start gap-2">
              <ExternalLink className="w-4 h-4 text-primary mt-0.5" />
              <p className="text-sm">
                Partnership Ads perform 30% better on average
              </p>
            </div>
          </div>

          {/* Disconnect button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-muted-foreground">
                <Unlink className="w-4 h-4 mr-2" />
                Disconnect Instagram
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect Instagram?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will disable Partnership Ads for your account. Brands will no longer
                  be able to run ads with your creator attribution.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {disconnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Disconnect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : (
        <>
          {/* Not connected state */}
          <div className="space-y-4">
            <Button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              {connecting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Instagram className="w-4 h-4 mr-2" />
              )}
              Connect Instagram
            </Button>

            {/* Requirements */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Requirements
              </p>
              <ul className="text-sm text-muted-foreground space-y-2 ml-6 list-disc">
                <li>Instagram Business or Creator account</li>
                <li>Instagram connected to a Facebook Page</li>
                <li>Admin access to the Facebook Page</li>
              </ul>
            </div>

            {/* Benefits preview */}
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                <p className="text-sm">
                  Brands can promote your videos as authentic Partnership Ads
                </p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                <p className="text-sm">
                  Your profile appears as the creator on all promoted content
                </p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                <p className="text-sm">
                  Partnership Ads perform 30% better on average
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
