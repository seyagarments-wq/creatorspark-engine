import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getVideoUrl } from "@/lib/storage";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string | null;
  title?: string;
}

export function VideoPreviewDialog({
  open,
  onOpenChange,
  videoUrl,
  title,
}: VideoPreviewDialogProps) {
  const fullVideoUrl = videoUrl ? getVideoUrl(videoUrl) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-black border-0">
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full"
            onClick={() => onOpenChange(false)}
          >
            <X className="w-4 h-4" />
          </Button>
          
          {fullVideoUrl ? (
            <video
              src={fullVideoUrl}
              controls
              autoPlay
              playsInline
              className="w-full max-h-[80vh] object-contain"
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No video available
            </div>
          )}
        </div>
        
        {title && (
          <div className="p-3 bg-card border-t">
            <p className="text-sm font-medium truncate">{title}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
