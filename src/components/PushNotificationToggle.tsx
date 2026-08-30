import { Bell, BellOff, Loader2, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { usePushNotifications } from "@/hooks/use-push-notifications";

interface PushNotificationToggleProps {
  variant?: "button" | "switch";
  showLabel?: boolean;
}

// Detect if running as installed PWA
const isPWAInstalled = () => {
  return window.matchMedia('(display-mode: standalone)').matches 
    || (navigator as any).standalone === true;
};

// Detect iOS
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

// Detect if using Safari on iOS
const isIOSSafari = () => {
  const ua = navigator.userAgent;
  return isIOS() && /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
};

export function PushNotificationToggle({ 
  variant = "switch", 
  showLabel = true 
}: PushNotificationToggleProps) {
  const { isSupported, isSubscribed, isLoading, permission, subscribe, unsubscribe } = usePushNotifications();

  // iOS-specific: Must be installed as PWA to receive push notifications
  if (isIOS() && !isPWAInstalled()) {
    return (
      <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/50">
        <div className="flex items-center gap-2 text-primary">
          <Bell className="h-5 w-5" />
          <span className="font-medium">Enable Push Notifications</span>
        </div>
        <p className="text-sm text-muted-foreground">
          To receive push notifications on iOS, you need to install this app first:
        </p>
        <ol className="text-sm text-muted-foreground space-y-2 ml-1">
          <li className="flex items-start gap-2">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">1</span>
            <span>
              {isIOSSafari() ? (
                <>Tap the <Share className="inline h-4 w-4 mx-1" /> Share button below</>
              ) : (
                "Open this page in Safari browser"
              )}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">2</span>
            <span>Select <strong>"Add to Home Screen"</strong> <Plus className="inline h-4 w-4 mx-1" /></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">3</span>
            <span>Open the app from your home screen</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">4</span>
            <span>Return here to enable notifications</span>
          </li>
        </ol>
      </div>
    );
  }

  if (!isSupported) {
    return showLabel ? (
      <p className="text-sm text-muted-foreground">
        Push notifications are not supported in this browser.
      </p>
    ) : null;
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  if (variant === "button") {
    return (
      <Button
        variant={isSubscribed ? "outline" : "default"}
        size="sm"
        onClick={handleToggle}
        disabled={isLoading}
        className="gap-2"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isSubscribed ? (
          <BellOff className="h-4 w-4" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        {isSubscribed ? "Disable Notifications" : "Enable Notifications"}
      </Button>
    );
  }

  return (
    <div className="flex items-center justify-between">
      {showLabel && (
        <div className="space-y-0.5">
          <Label htmlFor="push-notifications" className="text-base">
            Browser Push Notifications
          </Label>
          <p className="text-sm text-muted-foreground">
            {permission === "denied" 
              ? "Notifications are blocked. Please enable them in your browser settings."
              : "Receive real-time alerts even when the app isn't open"}
          </p>
        </div>
      )}
      <Switch
        id="push-notifications"
        checked={isSubscribed}
        onCheckedChange={handleToggle}
        disabled={isLoading || permission === "denied"}
      />
    </div>
  );
}
