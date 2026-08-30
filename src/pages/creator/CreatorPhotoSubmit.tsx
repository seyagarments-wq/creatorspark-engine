import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Camera, Upload, X, Loader2, CheckCircle, ArrowLeft, ImagePlus } from "lucide-react";
import confetti from "canvas-confetti";

interface SelectedFile {
  file: File;
  preview: string;
}

export default function CreatorPhotoSubmit() {
  const { profileId, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const storyInputRef = useRef<HTMLInputElement>(null);
  const feedInputRef = useRef<HTMLInputElement>(null);

  const [creativeName, setCreativeName] = useState("");
  const [description, setDescription] = useState("");
  const [storyFile, setStoryFile] = useState<SelectedFile | null>(null);
  const [feedFile, setFeedFile] = useState<SelectedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  function handleFileSelect(files: FileList | null, slot: "story" | "feed") {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) return;
    const preview = URL.createObjectURL(file);
    if (slot === "story") {
      if (storyFile) URL.revokeObjectURL(storyFile.preview);
      setStoryFile({ file, preview });
    } else {
      if (feedFile) URL.revokeObjectURL(feedFile.preview);
      setFeedFile({ file, preview });
    }
  }

  function removeFile(slot: "story" | "feed") {
    if (slot === "story" && storyFile) {
      URL.revokeObjectURL(storyFile.preview);
      setStoryFile(null);
    } else if (slot === "feed" && feedFile) {
      URL.revokeObjectURL(feedFile.preview);
      setFeedFile(null);
    }
  }

  async function uploadFile(selected: SelectedFile): Promise<string> {
    const fileExt = selected.file.name.split(".").pop() || "jpg";
    const fileName = `${user!.id}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
    const { error } = await supabase.storage
      .from("photos")
      .upload(fileName, selected.file, { cacheControl: "3600", upsert: false });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("photos").getPublicUrl(fileName);
    return urlData.publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profileId || !user || !storyFile || !feedFile || !creativeName.trim()) {
      toast({ title: "Please fill in the creative name and both photos", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Upload story version
      const storyUrl = await uploadFile(storyFile);
      setUploadProgress(40);

      // Upload feed version
      const feedUrl = await uploadFile(feedFile);
      setUploadProgress(80);

      const { error } = await supabase.from("photo_submissions").insert({
        creator_id: profileId,
        creative_name: creativeName.trim(),
        title: creativeName.trim(),
        link_url: null,
        bounty_id: null,
        edited_count: 2,
        raw_count: 0,
        notes: description.trim() || null,
        photo_urls: [storyUrl, feedUrl],
        thumbnail_url: storyUrl,
        status: "pending",
      } as any);

      if (error) throw error;

      setUploadProgress(100);
      setUploadSuccess(true);

      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, zIndex: 9999 });
      toast({ title: "📸 Creative submitted!", description: `"${creativeName.trim()}" uploaded for review.` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setIsUploading(false);
    }
  }

  if (uploadSuccess) {
    return (
      <CreatorLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-fade-in">
          <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Creative Submitted!</h2>
          <p className="text-muted-foreground mb-6">
            "{creativeName}" — Story + Feed versions uploaded and pending review.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate("/creator/photo-submissions")}>
              My Content
            </Button>
            <Button onClick={() => {
              setStoryFile(null);
              setFeedFile(null);
              setCreativeName("");
              setDescription("");
              setUploadSuccess(false);
              setUploadProgress(0);
              setIsUploading(false);
            }}>
              Submit Another
            </Button>
          </div>
        </div>
      </CreatorLayout>
    );
  }

  const bothPhotosReady = !!storyFile && !!feedFile;

  return (
    <CreatorLayout>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in pb-24">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              Submit Creative
            </h1>
            <p className="text-sm text-muted-foreground">Upload one creative — Story + Feed versions</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Creative Name */}
          <div className="space-y-2">
            <Label htmlFor="creative-name">Creative Name <span className="text-destructive">*</span></Label>
            <Input
              id="creative-name"
              value={creativeName}
              onChange={e => setCreativeName(e.target.value)}
              placeholder="Name your creative (e.g. Summer Glow Lifestyle)"
              required
            />
            <p className="text-xs text-muted-foreground">This is what your creative will be called when exported</p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Notes (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Any notes about this creative..."
              rows={2}
            />
          </div>

          {/* Two upload slots */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Story / Reel (9:16) */}
            <div className="space-y-2">
              <Label>9x16 Version (Story/Reel) <span className="text-destructive">*</span></Label>
              {storyFile ? (
                <div className="relative aspect-[9/16] rounded-xl overflow-hidden border bg-muted group">
                  <img src={storyFile.preview} alt="Story version" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeFile("story")}
                    className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => storyInputRef.current?.click()}
                    className="absolute bottom-2 right-2 bg-black/60 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Upload className="w-4 h-4 text-white" />
                  </button>
                </div>
              ) : (
                <div
                  className="aspect-[9/16] rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center cursor-pointer transition-colors bg-muted/30"
                  onClick={() => storyInputRef.current?.click()}
                >
                  <ImagePlus className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">9:16 Portrait</p>
                  <p className="text-xs text-muted-foreground mt-1">Tap to upload</p>
                </div>
              )}
              <input
                ref={storyInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/heic"
                className="hidden"
                onChange={e => handleFileSelect(e.target.files, "story")}
              />
            </div>

            {/* Feed Post */}
            <div className="space-y-2">
              <Label>Feed Post Version <span className="text-destructive">*</span></Label>
              {feedFile ? (
                <div className="relative aspect-[4/5] rounded-xl overflow-hidden border bg-muted group">
                  <img src={feedFile.preview} alt="Feed version" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeFile("feed")}
                    className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => feedInputRef.current?.click()}
                    className="absolute bottom-2 right-2 bg-black/60 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Upload className="w-4 h-4 text-white" />
                  </button>
                </div>
              ) : (
                <div
                  className="aspect-[4/5] rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center cursor-pointer transition-colors bg-muted/30"
                  onClick={() => feedInputRef.current?.click()}
                >
                  <ImagePlus className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">Feed Post</p>
                  <p className="text-xs text-muted-foreground mt-1">Tap to upload</p>
                </div>
              )}
              <input
                ref={feedInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/heic"
                className="hidden"
                onChange={e => handleFileSelect(e.target.files, "feed")}
              />
            </div>
          </div>

          {isUploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} />
              <p className="text-sm text-muted-foreground text-center">Uploading... {uploadProgress}%</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isUploading || !bothPhotosReady || !creativeName.trim()}
            size="lg"
          >
            {isUploading ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Uploading...</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" /> Submit Creative</>
            )}
          </Button>
        </form>
      </div>
    </CreatorLayout>
  );
}
