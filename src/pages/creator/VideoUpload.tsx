import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Video, Loader2, CheckCircle } from "lucide-react";
import { generateUniqueVideoId } from "@/lib/video-id";

export default function VideoUpload() {
  const { profileId, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Title is optional - will use unique video ID if not provided

    if (!profileId) {
      toast({
        title: "Error",
        description: "Please complete your profile first",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Generate unique video ID
      const uniqueVideoId = await generateUniqueVideoId();

      // For now, we'll just create the video record without file upload
      // File upload to storage can be added later
      const { data, error } = await supabase.from("videos").insert({
        creator_id: profileId,
        unique_video_id: uniqueVideoId,
        title: title.trim() || uniqueVideoId,
        description: description.trim() || null,
        status: "pending",
      }).select().single();

      if (error) throw error;

      setUploadSuccess(true);
      toast({
        title: "Video submitted!",
        description: `Your video has been submitted for review. ID: ${uniqueVideoId}`,
      });

      // Redirect after short delay
      setTimeout(() => {
        navigate("/creator/videos");
      }, 2000);

    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to submit video. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }

  if (uploadSuccess) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto">
          <div className="stat-card text-center py-12">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Video Submitted!</h2>
            <p className="text-muted-foreground mb-6">
              Your video has been submitted for review. You'll be notified once it's approved.
            </p>
            <Button variant="success" asChild>
              <Link to="/creator/videos">View My Videos</Link>
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <Link
          to="/creator/videos"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to videos
        </Link>

        <div className="stat-card">
          <h1 className="text-2xl font-bold mb-2">Upload Video</h1>
          <p className="text-muted-foreground mb-8">
            Submit a new video for review. Once approved, it will be added to the ad library.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Video file upload area */}
            <div className="space-y-2">
              <Label>Video File (Optional)</Label>
              <div 
                className="border-2 border-dashed rounded-xl p-8 text-center hover:border-accent/50 transition-colors cursor-pointer"
                onClick={() => document.getElementById("video-input")?.click()}
              >
                <input
                  id="video-input"
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                />
                {videoFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <Video className="w-8 h-8 text-success" />
                    <div className="text-left">
                      <p className="font-medium">{videoFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                    <p className="font-medium mb-1">Click to upload or drag and drop</p>
                    <p className="text-sm text-muted-foreground">
                      MP4, MOV, or WebM (max 500MB)
                    </p>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Video upload is optional. You can also share a link in the description.
              </p>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                placeholder="Give your video a descriptive title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe your video content, concept, or include any links..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            {/* Submit */}
            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => navigate("/creator/videos")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="success"
                className="flex-1"
                disabled={isUploading}
              >
                {isUploading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Submit Video
              </Button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
