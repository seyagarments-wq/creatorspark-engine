import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Upload,
  Video,
  Loader2,
  CheckCircle,
  X,
  Camera,
  Send,
  ExternalLink,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import confetti from "canvas-confetti";
import { playSoundEffect } from "@/hooks/use-sound-effects";
import { generateUniqueVideoId } from "@/lib/video-id";

const fireConfetti = () => {
  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
    zIndex: 9999,
  };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  fire(0.25, {
    spread: 26,
    startVelocity: 55,
    origin: { x: 0.2, y: 0.7 },
  });

  fire(0.2, {
    spread: 60,
    origin: { x: 0.5, y: 0.7 },
  });

  fire(0.25, {
    spread: 26,
    startVelocity: 55,
    origin: { x: 0.8, y: 0.7 },
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 45,
  });
};

interface Brand {
  id: string;
  name: string;
  logo_url: string | null;
}

interface UploadedVideo {
  file: File;
  title: string;
  preGeneratedVideoId?: string; // Pre-generated V-ID so title can reference the sequence
}

export default function CreatorSubmit() {
  const { profileId, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState("");
  const [videoFiles, setVideoFiles] = useState<UploadedVideo[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [activeBounties, setActiveBounties] = useState<{ id: string; title: string }[]>([]);
  const [selectedBountyId, setSelectedBountyId] = useState<string>("none");
  const [isDragOver, setIsDragOver] = useState(false);
  const dragSoundDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Photo bounty state
  const [photoBounties, setPhotoBounties] = useState<any[]>([]);
  const [photoSubmissions, setPhotoSubmissions] = useState<Record<string, { link_url: string; status: string; edited_count: number; raw_count: number }>>({});
  const [photoLink, setPhotoLink] = useState("");
  const [photoNotes, setPhotoNotes] = useState("");
  const [photoEditedCount, setPhotoEditedCount] = useState(5);
  const [photoRawCount, setPhotoRawCount] = useState(20);
  const [photoSubmitting, setPhotoSubmitting] = useState(false);

  useEffect(() => {
    if (profileId) {
      fetchPartnerBrands();
      fetchActiveBounties();
      fetchPhotoBounties();
    }
  }, [profileId]);

  async function fetchPhotoBounties() {
    try {
      const [{ data: bounties }, { data: cohortMemberships }, { data: subs }] = await Promise.all([
        supabase
          .from("bounties")
          .select("id, title, description, milestone_type, milestone_value, reward_amount, expires_at, cohort_id, created_at")
          .eq("status", "active")
          .eq("milestone_type", "photo_submission"),
        supabase.from("creator_cohort_members").select("cohort_id").eq("creator_id", profileId),
        supabase.from("photo_submissions").select("bounty_id, link_url, status, edited_count, raw_count").eq("creator_id", profileId),
      ]);

      const myCohortIds = new Set(cohortMemberships?.map(m => m.cohort_id) || []);
      const now = new Date();
      const valid = (bounties || []).filter((b: any) => {
        if (b.cohort_id && !myCohortIds.has(b.cohort_id)) return false;
        if (b.expires_at && new Date(b.expires_at) < now) return false;
        return true;
      });
      setPhotoBounties(valid);

      const subsMap: Record<string, any> = {};
      (subs || []).forEach((s: any) => { subsMap[s.bounty_id] = s; });
      setPhotoSubmissions(subsMap);
    } catch (err) {
      console.error("Error fetching photo bounties:", err);
    }
  }

  async function handlePhotoSubmit(bountyId: string) {
    if (!profileId || !photoLink.trim()) return;
    setPhotoSubmitting(true);
    try {
      const { error } = await supabase.from("photo_submissions").insert({
        bounty_id: bountyId,
        creator_id: profileId,
        link_url: photoLink.trim(),
        edited_count: photoEditedCount,
        raw_count: photoRawCount,
        notes: photoNotes.trim() || null,
      });
      if (error) throw error;
      toast({ title: "📸 Photos submitted!", description: "We'll review them shortly." });
      setPhotoLink("");
      setPhotoNotes("");
      setPhotoEditedCount(5);
      setPhotoRawCount(20);
      fetchPhotoBounties();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to submit", variant: "destructive" });
    } finally {
      setPhotoSubmitting(false);
    }
  }

  async function fetchActiveBounties() {
    try {
      const [{ data, error }, { data: cohortMemberships }] = await Promise.all([
        supabase
          .from("bounties")
          .select("id, title, milestone_type, expires_at, time_limit_days, created_at, cohort_id")
          .eq("status", "active")
          .eq("milestone_type", "approved_uploads")
          .order("created_at", { ascending: false }),
        supabase
          .from("creator_cohort_members")
          .select("cohort_id")
          .eq("creator_id", profileId),
      ]);

      if (error) throw error;

      const myCohortIds = new Set(cohortMemberships?.map(m => m.cohort_id) || []);

      // Filter out expired bounties and cohort-exclusive ones the creator isn't part of
      const now = new Date();
      const validBounties = (data || []).filter((b: any) => {
        // Cohort filter
        if (b.cohort_id && !myCohortIds.has(b.cohort_id)) return false;
        // Expiry filter
        if (b.expires_at) return new Date(b.expires_at) > now;
        if (b.time_limit_days) {
          const deadline = new Date(new Date(b.created_at).getTime() + b.time_limit_days * 24 * 60 * 60 * 1000);
          return deadline > now;
        }
        return true;
      });

      setActiveBounties(validBounties);
    } catch (error) {
      console.error("Error fetching active bounties:", error);
    }
  }

  async function fetchPartnerBrands() {
    try {
      const { data, error } = await supabase
        .from("creator_brands")
        .select(`
          brand_id,
          brands:brand_id (
            id,
            name,
            logo_url
          )
        `)
        .eq("creator_id", profileId)
        .eq("status", "active");

      if (error) throw error;

      const partnerBrands = data
        ?.map((cb: any) => cb.brands)
        .filter(Boolean) as Brand[];

      setBrands(partnerBrands || []);

      if (partnerBrands?.length === 1) {
        setBrandId(partnerBrands[0].id);
      }
    } catch (error) {
      console.error("Error fetching partner brands:", error);
    } finally {
      setLoadingBrands(false);
    }
  }

  // generateUniqueVideoId is now imported from @/lib/video-id

  // Extract a thumbnail frame from a video file
  async function generateThumbnail(file: File): Promise<Blob | null> {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";

      const objectUrl = URL.createObjectURL(file);
      
      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
        video.src = "";
        video.load();
      };

      const timeout = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 8000);

      video.onloadedmetadata = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          video.currentTime = Math.min(1, video.duration / 4);
        } else {
          clearTimeout(timeout);
          cleanup();
          resolve(null);
        }
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          // Use full resolution up to 720x1280 for high-quality thumbnails
          const scale = Math.min(1, 720 / video.videoWidth, 1280 / video.videoHeight);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          const ctx = canvas.getContext("2d");
          if (ctx && video.videoWidth > 0) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
              (blob) => {
                clearTimeout(timeout);
                cleanup();
                resolve(blob);
              },
              "image/jpeg",
              0.92
            );
            return;
          }
        } catch {
          // silently fail
        }
        clearTimeout(timeout);
        cleanup();
        resolve(null);
      };

      video.onerror = () => {
        clearTimeout(timeout);
        cleanup();
        resolve(null);
      };

      video.src = objectUrl;
      video.load();
    });
  }

  async function uploadThumbnail(blob: Blob, userId: string): Promise<string | null> {
    const fileName = `${userId}/thumb-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from("videos")
      .upload(fileName, blob, {
        cacheControl: "3600",
        upsert: false,
        contentType: "image/jpeg",
      });

    if (error) {
      console.error("Thumbnail upload error:", error);
      return null;
    }

    const { data: urlData } = supabase.storage.from("videos").getPublicUrl(fileName);
    return urlData.publicUrl;
  }

  async function uploadVideoFile(file: File): Promise<string | null> {
    if (!user) return null;

    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw uploadError;
    }

    const { data: urlData } = supabase.storage
      .from("videos")
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files) return;

    // Fetch creator's first name for auto-titling
    let firstName = "Creator";
    if (profileId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", profileId)
        .single();
      if (profile?.full_name) {
        // Use only the first name, uppercased
        firstName = profile.full_name.split(" ")[0].toUpperCase();
      }
    }

    // Pre-generate V-IDs for each file so we can derive the sequence number for the title
    const videoIdResults = await Promise.all(
      Array.from(files).map(() => generateUniqueVideoId())
    );

    const newVideos: UploadedVideo[] = Array.from(files).map((file, index) => {
      const preGeneratedVideoId = videoIdResults[index];
      // Extract sequence from V-ID: "V220-7" → "7"
      const sequence = preGeneratedVideoId.split("-")[1] ?? String(index + 1);
      return {
        file,
        title: `${firstName}#${sequence}`,
        preGeneratedVideoId,
      };
    });

    setVideoFiles((prev) => [...prev, ...newVideos]);
  }

  function updateVideoTitle(index: number, title: string) {
    setVideoFiles((prev) =>
      prev.map((v, i) => (i === index ? { ...v, title } : v))
    );
  }

  function removeVideo(index: number) {
    setVideoFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!brandId) {
      toast({
        title: "Brand required",
        description: "Please select the brand you're submitting for",
        variant: "destructive",
      });
      return;
    }

    if (videoFiles.length === 0) {
      toast({
        title: "Videos required",
        description: "Please upload at least one video",
        variant: "destructive",
      });
      return;
    }

    // Titles are optional - will use filename if empty

    if (!profileId) {
      toast({
        title: "Error",
        description: "Please complete your profile first",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setCurrentUploadIndex(0);

    try {
      const totalVideos = videoFiles.length;
      let successCount = 0;

      for (let i = 0; i < videoFiles.length; i++) {
        setCurrentUploadIndex(i);
        const video = videoFiles[i];

        const baseProgress = (i / totalVideos) * 100;
        const videoProgress = (1 / totalVideos) * 100;

        setUploadProgress(Math.round(baseProgress + videoProgress * 0.05));

        // Use pre-generated V-ID if available (avoids double-generating and keeps title in sync)
        const [uniqueVideoId, thumbnailBlob] = await Promise.all([
          video.preGeneratedVideoId ? Promise.resolve(video.preGeneratedVideoId) : generateUniqueVideoId(),
          generateThumbnail(video.file),
        ]);

        setUploadProgress(Math.round(baseProgress + videoProgress * 0.15));

        // Upload thumbnail and video file in parallel
        const [thumbnailUrl, videoUrl] = await Promise.all([
          thumbnailBlob && user ? uploadThumbnail(thumbnailBlob, user.id) : Promise.resolve(null),
          uploadVideoFile(video.file),
        ]);

        setUploadProgress(Math.round(baseProgress + videoProgress * 0.85));

        const insertData: any = {
          creator_id: profileId,
          unique_video_id: uniqueVideoId,
          title: video.title.trim() || video.file.name.replace(/\.[^/.]+$/, ""),
          video_url: videoUrl,
          thumbnail_url: thumbnailUrl,
          brand_id: brandId,
          status: "pending",
        };

        if (selectedBountyId && selectedBountyId !== "none") {
          insertData.bounty_id = selectedBountyId;
        }

        const { error } = await supabase.from("videos").insert(insertData);

        if (error) throw error;

        successCount++;
        setUploadProgress(Math.round(baseProgress + videoProgress));
      }

      setUploadProgress(100);
      setSubmittedCount(successCount);
      setUploadSuccess(true);

      // 🎉 Celebrate with confetti and sound — delay so the success DOM renders first
      setTimeout(() => {
        fireConfetti();
        playSoundEffect("celebration");
      }, 150);

      toast({
        title: `🎉 ${successCount} video${successCount > 1 ? "s" : ""} submitted!`,
        description: "Your videos are now pending review",
      });

      // Send push notifications
      try {
        // Notify creator
        if (user) {
          await supabase.functions.invoke("send-notification-email", {
            body: {
              user_id: user.id,
              title: "Video Submitted!",
              message: `Your ${successCount > 1 ? `${successCount} videos have` : "video has"} been submitted for review.`,
              notification_type: "video",
              link: "/creator/my-videos",
            },
          });
        }

        // Notify admins
        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        // Get creator profile for peer notification
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", profileId)
          .single();

        if (admins?.length) {
          for (const admin of admins) {
            await supabase.functions.invoke("send-notification-email", {
              body: {
                user_id: admin.user_id,
                title: "New Video Submission",
                message: `${profile?.full_name || "A creator"} submitted ${successCount} video${successCount > 1 ? "s" : ""} for review.`,
                notification_type: "video",
                link: "/admin/submissions",
              },
            });
          }
        }

        // Notify mentor(s) about new upload (fire-and-forget)
        if (profileId) {
          supabase.functions.invoke("notify-mentor-new-upload", {
            body: {
              creator_id: profileId,
              video_titles: videoFiles.map(v => v.title.trim() || v.file.name.replace(/\.[^/.]+$/, "")),
            },
          }).catch(e => console.error("Failed to notify mentor:", e));
        }

      } catch (notifyError) {
        console.error("Failed to send submission notification:", notifyError);
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to submit videos",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }

  if (uploadSuccess) {
    return (
      <CreatorLayout>
        <div className="max-w-xl mx-auto animate-fade-in">
          <div className="bg-card rounded-xl border p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
            <h2 className="text-2xl font-bold mb-2">
              {submittedCount} Video{submittedCount > 1 ? "s" : ""} Submitted!
            </h2>
            <p className="text-muted-foreground mb-6">
              Your video{submittedCount > 1 ? "s have" : " has"} been submitted for review.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" asChild>
                <Link to="/creator/my-videos">View My Videos</Link>
              </Button>
              <Button
                onClick={() => {
                  setUploadSuccess(false);
                  setVideoFiles([]);
                  setBrandId(brands.length === 1 ? brands[0].id : "");
                  setSelectedBountyId("none");
                  setUploadProgress(0);
                  setSubmittedCount(0);
                }}
              >
                Submit More
              </Button>
            </div>
          </div>
        </div>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout>
      <div className="max-w-xl mx-auto animate-fade-in">
        <Link
          to="/creator"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        {/* Photo Bounty Cards */}
        {photoBounties.map((bounty) => {
          const existingSub = photoSubmissions[bounty.id];
          return (
            <Card key={bounty.id} className="mb-6 border-primary/30 bg-primary/5">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Camera className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{bounty.title}</h3>
                    <p className="text-xs text-muted-foreground">${Number(bounty.reward_amount).toFixed(0)} reward</p>
                  </div>
                </div>

                {existingSub ? (
                  <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Camera className="w-4 h-4 text-primary" />
                      <span>{existingSub.status === "approved" ? "Approved ✅" : existingSub.status === "rejected" ? "Needs Revision" : "Pending Review ⏳"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <ExternalLink className="w-3 h-3" />
                      <a href={existingSub.link_url} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate">{existingSub.link_url}</a>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {existingSub.edited_count} edited · {existingSub.raw_count} raw photos
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm leading-relaxed space-y-2">
                      <p>📸 We need at least <strong className="text-foreground">5 fully edited</strong> high-quality UGC photos. If you've got all of them polished and ready, we'd love to appreciate you even more.</p>
                      <p>On top of that, send us <strong className="text-foreground">20–25 raw throwaway shots</strong> — the candid, in-the-moment stuff.</p>
                      <p className="text-xs text-muted-foreground">Use WeTransfer, Google Drive, or any file sharing link.</p>
                    </div>
                    <div>
                      <Label htmlFor="photo-link-submit" className="text-xs">File Transfer Link *</Label>
                      <Input
                        id="photo-link-submit"
                        placeholder="https://we.tl/... or Google Drive link"
                        value={photoLink}
                        onChange={(e) => setPhotoLink(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Edited Photos</Label>
                        <Input type="number" min={1} value={photoEditedCount} onChange={(e) => setPhotoEditedCount(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">Raw/Throwaway Photos</Label>
                        <Input type="number" min={1} value={photoRawCount} onChange={(e) => setPhotoRawCount(Number(e.target.value))} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Notes (optional)</Label>
                      <Textarea
                        placeholder="Any notes about the shoot..."
                        value={photoNotes}
                        onChange={(e) => setPhotoNotes(e.target.value)}
                        className="min-h-[60px]"
                      />
                    </div>
                    <Button className="w-full" onClick={() => handlePhotoSubmit(bounty.id)} disabled={!photoLink.trim() || photoSubmitting}>
                      {photoSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                      Submit Photos
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        <div className="bg-card rounded-xl border p-6">
          <h1 className="text-2xl font-bold mb-2">Submit Videos</h1>
          <p className="text-muted-foreground mb-6">
            Upload one or more videos for brand review
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Brand selector */}
            <div className="space-y-2">
              <Label>Brand *</Label>
              <Select value={brandId} onValueChange={setBrandId} disabled={loadingBrands}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingBrands ? "Loading brands..." : "Select your brand"} />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {brands.length === 0 && !loadingBrands && (
                <p className="text-sm text-destructive">
                  You're not partnered with any brands yet. Contact support.
                </p>
              )}
            </div>

            {/* Bounty selector (optional) */}
            {activeBounties.length > 0 && (
              <div className="space-y-2">
                <Label>Submit for a Bounty (optional)</Label>
                <Select value={selectedBountyId} onValueChange={setSelectedBountyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="None — counts toward monthly guarantee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None — counts toward monthly guarantee</SelectItem>
                    {activeBounties.map((bounty) => (
                      <SelectItem key={bounty.id} value={bounty.id}>
                        {bounty.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {selectedBountyId && selectedBountyId !== "none"
                    ? "⚡ This upload will count toward the selected bounty but NOT the monthly $500 guarantee."
                    : "Videos not tagged to a bounty count toward your 35-video monthly guarantee."}
                </p>
              </div>
            )}

            {/* Video upload */}
            <div className="space-y-2">
              <Label>Video Files *</Label>
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer ${
                  isDragOver
                    ? "border-primary bg-primary/5 scale-[1.02] shadow-lg shadow-primary/10"
                    : "hover:border-primary/50"
                }`}
                onClick={() => document.getElementById("video-input")?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!isDragOver) {
                    setIsDragOver(true);
                    // Play subtle notification tick on drag-enter (debounced)
                    if (!dragSoundDebounce.current) {
                      dragSoundDebounce.current = setTimeout(() => {
                        dragSoundDebounce.current = null;
                      }, 1000);
                      try { playSoundEffect("notification", false); } catch {/* ignore */}
                    }
                  }
                }}
                onDragEnter={(e) => { e.preventDefault(); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  handleFilesSelected(e.dataTransfer.files);
                }}
              >
                <input
                  id="video-input"
                  type="file"
                  accept="video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFilesSelected(e.target.files)}
                />
                <Upload className={`w-10 h-10 mx-auto mb-4 transition-colors ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
                <p className={`font-medium mb-1 transition-colors ${isDragOver ? "text-primary" : ""}`}>
                  {isDragOver ? "Drop to upload!" : "Click to upload or drag and drop"}
                </p>
                <p className="text-sm text-muted-foreground">
                  MP4, MOV, or WebM (max 500MB each) — Select multiple files
                </p>
              </div>
            </div>

            {/* Video list with titles */}
            {videoFiles.length > 0 && (
              <div className="space-y-3">
                <Label>Videos to Submit ({videoFiles.length})</Label>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {videoFiles.map((video, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 bg-secondary rounded-lg p-3"
                    >
                      <div className="w-12 h-12 bg-muted rounded flex items-center justify-center flex-shrink-0">
                        <Video className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <Input
                          value={video.title}
                          onChange={(e) => updateVideoTitle(index, e.target.value)}
                          placeholder="Title (optional)"
                          className="mb-1"
                        />
                        <p className="text-xs text-muted-foreground truncate">
                          {video.file.name} • {(video.file.size / (1024 * 1024)).toFixed(1)} MB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0"
                        onClick={() => removeVideo(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload progress */}
            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Uploading video {currentUploadIndex + 1} of {videoFiles.length}...
                  </span>
                  <span className="font-medium">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            {/* Submit */}
            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => navigate("/creator")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isUploading || videoFiles.length === 0 || !brandId}
              >
                {isUploading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Submit {videoFiles.length > 0 ? `${videoFiles.length} Video${videoFiles.length > 1 ? "s" : ""}` : "Videos"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </CreatorLayout>
  );
}
