import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Download, Smartphone, Bell, CheckCircle2, Share, MoreVertical, PlusSquare } from "lucide-react";
import logo from "@/assets/logo.png";
import { useNavigate } from "react-router-dom";
import { usePushNotifications } from "@/hooks/use-push-notifications";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Install() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const { isSupported: pushSupported, isSubscribed, subscribe, isLoading: pushLoading } = usePushNotifications();

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));

    // Listen for install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
    }

    setDeferredPrompt(null);
  };

  const handleEnableNotifications = async () => {
    await subscribe();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Creators Control" className="w-10 h-10 rounded-xl" />
          <span className="font-bold text-xl">Creators Control</span>
        </div>
        <Button variant="ghost" onClick={() => navigate("/auth")}>
          Sign In
        </Button>
      </header>

      <main className="container max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Hero */}
        <div className="text-center space-y-4">
          <img src={logo} alt="Creators Control" className="w-24 h-24 rounded-3xl mx-auto shadow-lg shadow-primary/25" />
          <h1 className="text-3xl font-bold">Get the App</h1>
          <p className="text-muted-foreground">
            Install Creators Control for the best experience with push notifications and quick access.
          </p>
        </div>

        {/* Benefits */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Why Install?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <Bell className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="font-medium">Instant Notifications</p>
                <p className="text-sm text-muted-foreground">Get alerts when videos are approved</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="font-medium">Quick Access</p>
                <p className="text-sm text-muted-foreground">Launch from your home screen</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Download className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="font-medium">Works Offline</p>
                <p className="text-sm text-muted-foreground">Access your dashboard anytime</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Installation Status */}
        {isInstalled ? (
          <Card className="border-green-500/50 bg-green-500/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
                <div>
                  <p className="font-semibold text-green-500">App Installed!</p>
                  <p className="text-sm text-muted-foreground">You're all set to use Creators Control</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Android / Chrome Install */}
            {deferredPrompt && (
              <Button onClick={handleInstall} size="lg" className="w-full">
                <Download className="w-5 h-5 mr-2" />
                Install App
              </Button>
            )}

            {/* iOS Instructions */}
            {isIOS && !deferredPrompt && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Badge variant="outline">iPhone / iPad</Badge>
                  </CardTitle>
                  <CardDescription>Follow these steps to install</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold">
                      1
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Tap the Share button</p>
                      <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                        <Share className="w-4 h-4" />
                        <span className="text-sm">at the bottom of Safari</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold">
                      2
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Scroll and tap "Add to Home Screen"</p>
                      <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                        <PlusSquare className="w-4 h-4" />
                        <span className="text-sm">in the share menu</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold">
                      3
                    </div>
                    <div>
                      <p className="font-medium">Tap "Add" to confirm</p>
                      <p className="text-sm text-muted-foreground mt-1">The app will appear on your home screen</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Android Instructions (fallback) */}
            {isAndroid && !deferredPrompt && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Badge variant="outline">Android</Badge>
                  </CardTitle>
                  <CardDescription>Follow these steps to install</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold">
                      1
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Tap the menu button</p>
                      <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                        <MoreVertical className="w-4 h-4" />
                        <span className="text-sm">three dots in Chrome</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold">
                      2
                    </div>
                    <div>
                      <p className="font-medium">Tap "Add to Home screen"</p>
                      <p className="text-sm text-muted-foreground mt-1">or "Install app"</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold">
                      3
                    </div>
                    <div>
                      <p className="font-medium">Confirm installation</p>
                      <p className="text-sm text-muted-foreground mt-1">The app will appear on your home screen</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Desktop fallback */}
            {!isIOS && !isAndroid && !deferredPrompt && (
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground">
                    Visit this page on your phone to install the app, or look for the install button in your browser's address bar.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Push Notifications */}
        {pushSupported && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Push Notifications
              </CardTitle>
              <CardDescription>
                Get notified about video approvals, payouts, and more
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isSubscribed ? (
                <div className="flex items-center gap-2 text-green-500">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Notifications enabled</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    onClick={handleEnableNotifications}
                    disabled={pushLoading}
                    variant="outline"
                    className="w-full"
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    {pushLoading ? "Enabling..." : "Enable Notifications"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Sign in first to enable push notifications
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Continue Button */}
        <Button onClick={() => navigate("/auth")} size="lg" variant="outline" className="w-full">
          Continue to Sign In
        </Button>
      </main>
    </div>
  );
}
