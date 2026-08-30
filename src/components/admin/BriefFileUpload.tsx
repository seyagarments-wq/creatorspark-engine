import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, X, FileVideo, FileText, Image, Loader2 } from "lucide-react";

interface UploadedFile {
  name: string;
  url: string;
  type: "video" | "document" | "image";
}

interface BriefFileUploadProps {
  label: string;
  description: string;
  accept: string;
  files: UploadedFile[];
  uploading: boolean;
  onUpload: (files: FileList) => void;
  onRemove: (url: string) => void;
  filterType?: "video" | "document" | "image";
}

export function BriefFileUpload({
  label,
  description,
  accept,
  files,
  uploading,
  onUpload,
  onRemove,
  filterType,
}: BriefFileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredFiles = filterType
    ? files.filter((f) => f.type === filterType || (filterType === "document" && f.type === "image"))
    : files;

  const getIcon = (type: string) => {
    switch (type) {
      case "video":
        return <FileVideo className="w-4 h-4 text-primary" />;
      case "image":
        return <Image className="w-4 h-4 text-success" />;
      default:
        return <FileText className="w-4 h-4 text-warning" />;
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      
      <div
        className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onUpload(e.target.files);
              e.target.value = "";
            }
          }}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Uploading...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-2">
            <Upload className="w-6 h-6 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Click to upload or drag and drop
            </span>
          </div>
        )}
      </div>

      {filteredFiles.length > 0 && (
        <div className="space-y-2 mt-3">
          {filteredFiles.map((file) => (
            <div
              key={file.url}
              className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded-md"
            >
              <div className="flex items-center gap-2 min-w-0">
                {getIcon(file.type)}
                <span className="text-sm truncate">{file.name}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => onRemove(file.url)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
