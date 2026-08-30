import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAvatarUpload } from "@/hooks/use-avatar-upload";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { InstagramConnection } from "@/components/creator/InstagramConnection";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Loader2, CreditCard, ExternalLink, CheckCircle2, AlertCircle, Bell, BellOff, DollarSign } from "lucide-react";

interface ProfileData {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  country: string;
  emailNotifications: boolean;
  notifyVideoUpdates: boolean;
  notifyPayoutUpdates: boolean;
  notifyBountyUpdates: boolean;
  payoutMethod: string;
  paypalEmail: string;
}

interface StripeStatus {
  connected: boolean;
  onboarding_complete: boolean;
  payouts_enabled: boolean;
}

export default function CreatorProfile() {
  const { profileId, user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const { uploadAvatar, uploading: avatarUploading } = useAvatarUpload();
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, isLoading: pushLoading, permission: pushPermission, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushNotifications();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [savingPaypal, setSavingPaypal] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<StripeStatus>({
    connected: false,
    onboarding_complete: false,
    payouts_enabled: false,
  });
  const [profile, setProfile] = useState<ProfileData>({
    fullName: "",
    firstName: "",
    lastName: "",
    email: "",
    avatarUrl: null,
    country: "",
    emailNotifications: true,
    notifyVideoUpdates: true,
    notifyPayoutUpdates: true,
    notifyBountyUpdates: true,
    payoutMethod: "stripe",
    paypalEmail: "",
  });

  useEffect(() => {
    if (profileId) {
      fetchProfile();
      checkStripeStatus();
    }
  }, [profileId]);

  // Handle Stripe redirect
  useEffect(() => {
    if (searchParams.get("stripe_success")) {
      checkStripeStatus();
      toast({
        title: "Stripe connected!",
        description: "Your payout account has been set up successfully.",
      });
    } else if (searchParams.get("stripe_refresh")) {
      handleConnectStripe();
    }
  }, [searchParams]);

  async function checkStripeStatus() {
    try {
      const { data, error } = await supabase.functions.invoke("check-connect-status");
      if (error) throw error;
      setStripeStatus({
        connected: data.connected || false,
        onboarding_complete: data.onboarding_complete || false,
        payouts_enabled: data.payouts_enabled || false,
      });
    } catch (error) {
      console.error("Error checking Stripe status:", error);
    }
  }

  const ALLOWED_COUNTRIES = ["US", "CA", "GB", "AU", "SG"];
  const hasValidCountry = ALLOWED_COUNTRIES.includes((profile.country || "").trim().toUpperCase());

  async function handleConnectStripe() {
    if (!hasValidCountry) {
      toast({
        title: "Country required",
        description: "Please select your country from the dropdown above before connecting your payout account.",
        variant: "destructive",
      });
      return;
    }

    setStripeLoading(true);
    try {
      // Auto-save country to DB before calling edge function so it's always in sync
      const { error: saveError } = await supabase
        .from("profiles")
        .update({ country: profile.country.trim().toUpperCase() })
        .eq("id", profileId);

      if (saveError) {
        console.error("Failed to save country before Stripe connect:", saveError);
      }

      const { data, error } = await supabase.functions.invoke("create-connect-account");
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to connect Stripe account",
        variant: "destructive",
      });
    } finally {
      setStripeLoading(false);
    }
  }

  async function fetchProfile() {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", profileId)
        .single();

      if (data) {
        const nameParts = data.full_name?.split(" ") || ["", ""];
        
        setProfile({
          fullName: data.full_name || "",
          firstName: nameParts[0] || "",
          lastName: nameParts.slice(1).join(" ") || "",
          email: data.email || user?.email || "",
          avatarUrl: data.avatar_url || null,
          country: (data as any).country || "",
          emailNotifications: data.email_notifications ?? true,
          notifyVideoUpdates: data.notify_video_updates ?? true,
          notifyPayoutUpdates: data.notify_payout_updates ?? true,
          notifyBountyUpdates: data.notify_bounty_updates ?? true,
          payoutMethod: (data as any).payout_method || "stripe",
          paypalEmail: (data as any).paypal_email || "",
        });
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadAvatar(file);
    if (url) {
      // Update profile with new avatar URL
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", profileId);

      if (!error) {
        setProfile({ ...profile, avatarUrl: url });
        // Refresh auth context so avatar updates everywhere
        await refreshProfile();
        toast({
          title: "Avatar updated",
          description: "Your profile photo has been updated.",
        });
      }
    } else {
      toast({
        title: "Upload failed",
        description: "Failed to upload avatar. Please try again.",
        variant: "destructive",
      });
    }
  }

  async function handleSaveProfile() {
    setSaving(true);
    try {
      const fullName = `${profile.firstName} ${profile.lastName}`.trim();
      
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          country: profile.country || null,
        } as any)
        .eq("id", profileId);

      if (error) throw error;

      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  // Instagram is now handled by the InstagramConnection component

  if (loading) {
    return (
      <CreatorLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout>
      <div className="max-w-2xl space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Account Settings</h1>
          <p className="text-muted-foreground">
            Manage your profile and account preferences
          </p>
        </div>

        {/* Profile Information */}
        <div className="bg-card rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-6">Profile Information</h2>

          <div className="flex items-center gap-6 mb-6">
            <div className="relative">
              <Avatar className="h-20 w-20">
                {profile.avatarUrl && (
                  <AvatarImage src={profile.avatarUrl} alt={profile.fullName} />
                )}
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {profile.firstName.charAt(0)}{profile.lastName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors cursor-pointer">
                {avatarUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                  disabled={avatarUploading}
                />
              </label>
            </div>
            <div>
              <p className="font-medium">{profile.fullName || "Your Name"}</p>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={profile.firstName}
                  onChange={(e) =>
                    setProfile({ ...profile, firstName: e.target.value })
                  }
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={profile.lastName}
                  onChange={(e) =>
                    setProfile({ ...profile, lastName: e.target.value })
                  }
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={profile.email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Select
                value={profile.country}
                onValueChange={(value) => setProfile({ ...profile, country: value })}
              >
                <SelectTrigger id="country">
                  <SelectValue placeholder="Select your country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">🇺🇸 United States</SelectItem>
                  <SelectItem value="CA">🇨🇦 Canada</SelectItem>
                  <SelectItem value="GB">🇬🇧 United Kingdom</SelectItem>
                  <SelectItem value="AU">🇦🇺 Australia</SelectItem>
                  <SelectItem value="SG">🇸🇬 Singapore</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Must be set before connecting your payout account
              </p>
            </div>

            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </div>
        </div>

        {/* Payout Method Selection */}
        <div className="bg-card rounded-xl border p-6">
          <div className="flex items-center gap-3 mb-2">
            <CreditCard className="w-6 h-6 text-primary" />
            <h2 className="text-lg font-semibold">Payout Account</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Choose how you'd like to receive your earnings
          </p>

          {/* Method Selector */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              type="button"
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                profile.payoutMethod === "stripe"
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-muted-foreground/30"
              }`}
              onClick={async () => {
                setProfile({ ...profile, payoutMethod: "stripe" });
                await supabase.from("profiles").update({ payout_method: "stripe" } as any).eq("id", profileId);
              }}
            >
              <CreditCard className={`w-6 h-6 ${profile.payoutMethod === "stripe" ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-sm font-medium ${profile.payoutMethod === "stripe" ? "text-primary" : "text-muted-foreground"}`}>
                Stripe (Bank)
              </span>
              <span className="text-xs text-muted-foreground text-center">
                Direct to bank account
              </span>
            </button>
            <button
              type="button"
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                profile.payoutMethod === "paypal"
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-muted-foreground/30"
              }`}
              onClick={async () => {
                setProfile({ ...profile, payoutMethod: "paypal" });
                await supabase.from("profiles").update({ payout_method: "paypal" } as any).eq("id", profileId);
              }}
            >
              <DollarSign className={`w-6 h-6 ${profile.payoutMethod === "paypal" ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-sm font-medium ${profile.payoutMethod === "paypal" ? "text-primary" : "text-muted-foreground"}`}>
                PayPal
              </span>
              <span className="text-xs text-muted-foreground text-center">
                International friendly
              </span>
            </button>
          </div>

          {/* Stripe Section */}
          {profile.payoutMethod === "stripe" && (
            <>
              {stripeStatus.payouts_enabled ? (
                <div className="bg-success/10 border border-success/20 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-success" />
                    <div>
                      <p className="font-medium text-success">Payout account connected</p>
                      <p className="text-sm text-muted-foreground">
                        You're all set to receive payouts to your bank account
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={handleConnectStripe}
                    disabled={stripeLoading}
                  >
                    {stripeLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <ExternalLink className="w-4 h-4 mr-2" />
                    )}
                    Update Payout Details
                  </Button>
                </div>
              ) : stripeStatus.connected && !stripeStatus.onboarding_complete ? (
                <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-6 h-6 text-warning" />
                    <div>
                      <p className="font-medium text-warning">Your payout setup is incomplete</p>
                      <p className="text-sm text-muted-foreground">
                        Click below to finish connecting your bank account so you can receive payments. This usually takes 2-3 minutes.
                      </p>
                    </div>
                  </div>
                  <Button
                    className="mt-4"
                    onClick={handleConnectStripe}
                    disabled={stripeLoading}
                  >
                    {stripeLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <ExternalLink className="w-4 h-4 mr-2" />
                    )}
                    Complete Bank Setup
                  </Button>
                </div>
              ) : (
                <div>
                  <Button onClick={handleConnectStripe} disabled={stripeLoading || !hasValidCountry}>
                    {stripeLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <CreditCard className="w-4 h-4 mr-2" />
                    )}
                    Connect Bank Account
                  </Button>
                  {!hasValidCountry && (
                    <p className="text-xs text-destructive mt-2">
                      ⚠ Select your country above and save your profile first
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Securely connect via Stripe to receive payments directly to your bank account
                  </p>
                </div>
              )}
            </>
          )}

          {/* PayPal Section */}
          {profile.payoutMethod === "paypal" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="paypalEmail">PayPal Email</Label>
                <Input
                  id="paypalEmail"
                  type="email"
                  value={profile.paypalEmail}
                  onChange={(e) => setProfile({ ...profile, paypalEmail: e.target.value })}
                  placeholder="your@paypal-email.com"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the email address linked to your PayPal account
                </p>
              </div>
              <Button
                onClick={async () => {
                  if (!profile.paypalEmail) {
                    toast({ title: "PayPal email required", description: "Please enter your PayPal email address", variant: "destructive" });
                    return;
                  }
                  setSavingPaypal(true);
                  try {
                    const { error } = await supabase.from("profiles").update({
                      paypal_email: profile.paypalEmail,
                      payout_method: "paypal",
                    } as any).eq("id", profileId);
                    if (error) throw error;
                    toast({ title: "PayPal saved", description: "Your PayPal email has been saved for payouts." });
                  } catch (err: any) {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  } finally {
                    setSavingPaypal(false);
                  }
                }}
                disabled={savingPaypal}
              >
                {savingPaypal && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Save PayPal Email
              </Button>
              {profile.paypalEmail && (
                <div className="bg-success/10 border border-success/20 rounded-lg p-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span className="text-sm text-success">PayPal connected: {profile.paypalEmail}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Instagram for Partnership Ads - Now uses OAuth */}
        <InstagramConnection />

        {/* Notifications */}
        <div className="bg-card rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-6">Notifications</h2>

          <div className="space-y-4">
            {/* Push Notifications */}
            {pushSupported && (
              <div className="pb-4 border-b space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {pushSubscribed ? (
                        <Bell className="w-4 h-4 text-primary" />
                      ) : (
                        <BellOff className="w-4 h-4 text-muted-foreground" />
                      )}
                      <p className="font-medium">Push Notifications</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {pushPermission === "denied" 
                        ? "Blocked in browser settings"
                        : "Get instant alerts on your phone or computer"}
                    </p>
                  </div>
                  <Switch
                    checked={pushSubscribed}
                    disabled={pushLoading || pushPermission === "denied"}
                    onCheckedChange={async (checked) => {
                      if (checked) {
                        await subscribePush();
                      } else {
                        await unsubscribePush();
                      }
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Receive updates about your campaigns and earnings
                </p>
              </div>
              <Switch
                checked={profile.emailNotifications}
                onCheckedChange={async (checked) => {
                  setProfile({ ...profile, emailNotifications: checked });
                  await supabase.from("profiles").update({ email_notifications: checked }).eq("id", profileId);
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Video Updates</p>
                <p className="text-sm text-muted-foreground">
                  Get notified when your videos are approved or need revisions
                </p>
              </div>
              <Switch
                checked={profile.notifyVideoUpdates}
                onCheckedChange={async (checked) => {
                  setProfile({ ...profile, notifyVideoUpdates: checked });
                  await supabase.from("profiles").update({ notify_video_updates: checked }).eq("id", profileId);
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Payment Updates</p>
                <p className="text-sm text-muted-foreground">
                  Notifications about payouts and earnings
                </p>
              </div>
              <Switch
                checked={profile.notifyPayoutUpdates}
                onCheckedChange={async (checked) => {
                  setProfile({ ...profile, notifyPayoutUpdates: checked });
                  await supabase.from("profiles").update({ notify_payout_updates: checked }).eq("id", profileId);
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Bounty & Reward Updates</p>
                <p className="text-sm text-muted-foreground">
                  Get notified about bounty progress and rewards
                </p>
              </div>
              <Switch
                checked={profile.notifyBountyUpdates}
                onCheckedChange={async (checked) => {
                  setProfile({ ...profile, notifyBountyUpdates: checked });
                  await supabase.from("profiles").update({ notify_bounty_updates: checked }).eq("id", profileId);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </CreatorLayout>
  );
}
