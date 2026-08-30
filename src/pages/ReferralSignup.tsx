import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Zap, Loader2, CheckCircle, Instagram, Video, User, Mail, Lock, Phone, Upload, Link2, X } from "lucide-react";
import logo from "@/assets/logo.png";

interface ReferrerInfo {
  full_name: string;
  referral_id: string;
  referrer_id: string;
}

export default function ReferralSignup() {
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get("ref") ?? "";
  const { toast } = useToast();

  const [referrer, setReferrer] = useState<ReferrerInfo | null>(null);
  const [loadingReferrer, setLoadingReferrer] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [sampleVideoUrl, setSampleVideoUrl] = useState("");
  // Video upload state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Look up referrer by their user id prefix (first 8 chars)
  useEffect(() => {
    async function lookupReferrer() {
      if (!refCode) { setLoadingReferrer(false); return; }
      try {
        // Find a referral row where the referrer's user_id starts with the code
        // We join through profiles to get user_id
        // Fetch all profiles and match by user_id prefix client-side
        // (PostgREST 'like' doesn't work reliably on UUID columns)
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, user_id");
        
        const matched = profiles?.filter(p => p.user_id?.startsWith(refCode));

        if (matched && matched.length > 0) {
          const p = matched[0];
          setReferrer({ full_name: p.full_name, referral_id: "", referrer_id: p.id });
        }
      } catch (err) {
        console.error("Referrer lookup error", err);
      } finally {
        setLoadingReferrer(false);
      }
    }
    lookupReferrer();
  }, [refCode]);

  function handleVideoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please choose a video under 100MB.", variant: "destructive" });
      return;
    }
    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setUploadedVideoUrl(null);
  }

  function clearVideo() {
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setUploadedVideoUrl(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  async function uploadVideoFile(): Promise<string | null> {
    if (!videoFile) return null;
    setVideoUploading(true);
    try {
      const ext = videoFile.name.split(".").pop();
      const path = `samples/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error } = await supabase.storage
        .from("application-videos")
        .upload(path, videoFile, { cacheControl: "3600", upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("application-videos").getPublicUrl(data.path);
      setUploadedVideoUrl(publicUrl);
      return publicUrl;
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      return null;
    } finally {
      setVideoUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hasVideo = videoFile || uploadedVideoUrl || sampleVideoUrl.trim();
    if (!fullName.trim() || !email.trim() || !password.trim() || !phoneNumber.trim() || !instagramHandle.trim() || !hasVideo) {
      toast({ title: "All fields are required", description: "Please upload a video or paste a video link.", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    // Upload file if one was selected but not yet uploaded
    let finalVideoUrl = uploadedVideoUrl || sampleVideoUrl.trim();
    if (videoFile && !uploadedVideoUrl) {
      const url = await uploadVideoFile();
      if (!url) { setSubmitting(false); return; }
      finalVideoUrl = url;
    }
    try {
      // Insert application row (status = pending, admin reviews it)
      const { error } = await supabase
        .from("referral_applications" as any)
        .insert({
          referrer_id: referrer?.referrer_id ?? null,
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone_number: phoneNumber.trim(),
          instagram_handle: instagramHandle.trim().replace(/^@/, ""),
          sample_video_url: finalVideoUrl,
          status: "pending",
        });

      if (error) throw error;

      // Create a referrals row so link-based signups are tracked on the leaderboard
      if (referrer?.referrer_id) {
        await supabase.from("referrals" as any).insert({
          referrer_id: referrer.referrer_id,
          referee_email: email.trim().toLowerCase(),
          status: "pending",
          bonus_amount: 25,
        }).then(({ error: refErr }) => {
          if (refErr) console.error("Referral tracking error:", refErr);
        });
      }

      // Optionally notify referrer in-app (best-effort)
      if (referrer?.referrer_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("id", referrer.referrer_id)
          .single();
        if (profile?.user_id) {
          await supabase.from("notifications").insert({
            user_id: profile.user_id,
            title: "Someone applied through your referral link! 🎉",
            message: `${fullName} applied to join the platform using your referral link. You'll earn your bonus once they're approved.`,
            notification_type: "general",
            link: "/creator/referrals",
          });
        }
      }

      setSubmitted(true);
    } catch (err: any) {
      toast({ title: "Error submitting", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingReferrer) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <h1 className="text-2xl font-bold">Application Submitted!</h1>
          <p className="text-muted-foreground">
            Our team will review your application. If approved, you'll receive an email with a link to set up your account and get your sample.
          </p>
          <p className="text-sm text-muted-foreground">You can close this window.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md space-y-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src={logo} alt="Creatorsctrl" className="w-10 h-10 rounded-xl" />
            <span className="font-bold text-xl">Creatorsctrl</span>
          </div>

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold">Join as a Creator</h1>
            {referrer ? (
              <p className="text-muted-foreground mt-1">
                <span className="font-medium text-foreground">{referrer.full_name}</span> invited you to apply.
              </p>
            ) : (
              <p className="text-muted-foreground mt-1">Apply to join the creator platform.</p>
            )}
          </div>

          {/* How it works */}
          <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 text-sm space-y-1">
            <p className="font-medium">How it works:</p>
            <ol className="list-decimal ml-4 text-muted-foreground space-y-0.5">
              <li>Fill out your details below</li>
              <li>Our team reviews your application</li>
              <li>If approved, you'll receive an email to complete sign-up</li>
              <li>Request your free sample and start creating!</li>
            </ol>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Full Name
              </Label>
              <Input
                id="fullName"
                placeholder="Jane Smith"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Choose a Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <p className="text-xs text-muted-foreground">At least 6 characters. You'll use this to log in once approved.</p>
            </div>

            {/* Phone Number */}
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Phone Number
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
              />
            </div>

            {/* Instagram */}
            <div className="space-y-1.5">
              <Label htmlFor="instagram" className="flex items-center gap-1.5">
                <Instagram className="w-3.5 h-3.5" /> Instagram Handle
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                <Input
                  id="instagram"
                  placeholder="yourcreatorhandle"
                  value={instagramHandle}
                  onChange={(e) => setInstagramHandle(e.target.value.replace(/^@/, ""))}
                  className="pl-7"
                  required
                />
              </div>
            </div>

            {/* Sample Video */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5" /> Sample Video
              </Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Show us your style! Upload a short clip of the kind of content you'd make with our hoodie, or paste a link to an existing video. <strong>It doesn't need to be posted anywhere.</strong>
              </p>

              {/* Upload option */}
              {!videoFile ? (
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-lg p-5 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer"
                >
                  <Upload className="w-6 h-6" />
                  <span className="text-sm font-medium">Click to upload a video</span>
                  <span className="text-xs">MP4, MOV, or any video — up to 100MB</span>
                </button>
              ) : (
                <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
                  <video src={videoPreviewUrl!} controls className="w-full max-h-40" />
                  <button
                    type="button"
                    onClick={clearVideo}
                    className="absolute top-2 right-2 bg-background/80 rounded-full p-1 hover:bg-background"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <p className="text-xs text-muted-foreground px-3 py-1.5 truncate">{videoFile.name}</p>
                </div>
              )}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleVideoFileChange}
              />

              {/* OR divider */}
              {!videoFile && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">or paste a link</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="relative">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      id="sampleVideo"
                      type="url"
                      placeholder="https://www.instagram.com/reel/..."
                      value={sampleVideoUrl}
                      onChange={(e) => setSampleVideoUrl(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Instagram Reel, TikTok, YouTube Short, etc.</p>
                </>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={submitting || videoUploading}>
              {(submitting || videoUploading) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {videoUploading ? "Uploading video…" : "Submit Application"}
            </Button>
          </form>

          <p className="text-xs text-center text-muted-foreground">
            Already have an account?{" "}
            <Link to="/auth" className="text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </div>

      {/* Decorative side */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary/10 to-primary/5 items-center justify-center p-12">
        <div className="max-w-sm space-y-6">
          <h2 className="text-3xl font-bold">Create Content. Get Paid.</h2>
          <p className="text-muted-foreground">
            Join our creator platform, receive free product samples, and earn commissions when your videos drive sales.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Commission Rate", value: "Up to 20%" },
              { label: "Free Samples", value: "Every Creator" },
              { label: "Avg. Monthly", value: "$2,500+" },
              { label: "Approval Time", value: "48 hours" },
            ].map((s) => (
              <div key={s.label} className="bg-background/60 rounded-xl p-4">
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
