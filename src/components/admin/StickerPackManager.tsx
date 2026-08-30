import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sticker, Plus, Trash2, Loader2, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface StickerPack {
  id: string;
  name: string;
  icon_url: string | null;
  sort_order: number;
  is_active: boolean;
}

interface StickerItem {
  id: string;
  pack_id: string;
  image_url: string;
  label: string | null;
  sort_order: number;
}

export function StickerPackManager() {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [activePack, setActivePack] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newPackName, setNewPackName] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPacks();
  }, []);

  useEffect(() => {
    if (activePack) fetchStickers(activePack);
  }, [activePack]);

  async function fetchPacks() {
    setLoading(true);
    const { data } = await supabase
      .from("sticker_packs")
      .select("id, name, icon_url, sort_order, is_active")
      .order("sort_order");
    if (data) {
      setPacks(data);
      if (data.length > 0 && !activePack) setActivePack(data[0].id);
    }
    setLoading(false);
  }

  async function fetchStickers(packId: string) {
    const { data } = await supabase
      .from("stickers")
      .select("id, pack_id, image_url, label, sort_order")
      .eq("pack_id", packId)
      .order("sort_order");
    setStickers(data || []);
  }

  async function createPack() {
    if (!newPackName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("sticker_packs")
      .insert({ name: newPackName.trim(), sort_order: packs.length })
      .select()
      .single();
    if (error) {
      toast.error("Failed to create pack");
    } else if (data) {
      toast.success(`Pack "${newPackName}" created`);
      setNewPackName("");
      setPacks((prev) => [...prev, data]);
      setActivePack(data.id);
    }
    setCreating(false);
  }

  async function deletePack(packId: string) {
    setDeleting(packId);
    // Delete stickers first
    await supabase.from("stickers").delete().eq("pack_id", packId);
    const { error } = await supabase.from("sticker_packs").delete().eq("id", packId);
    if (error) {
      toast.error("Failed to delete pack");
    } else {
      toast.success("Pack deleted");
      setPacks((prev) => prev.filter((p) => p.id !== packId));
      if (activePack === packId) {
        const remaining = packs.filter((p) => p.id !== packId);
        setActivePack(remaining.length > 0 ? remaining[0].id : null);
      }
    }
    setDeleting(null);
  }

  async function handleStickerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !activePack) return;
    setUploading(true);

    let uploaded = 0;
    for (const file of Array.from(files)) {
      try {
        const ext = file.name.split(".").pop();
        const path = `${activePack}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("stickers")
          .upload(path, file, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("stickers").getPublicUrl(path);

        const { error: insertError } = await supabase.from("stickers").insert({
          pack_id: activePack,
          image_url: urlData.publicUrl,
          label: file.name.replace(/\.[^.]+$/, ""),
          sort_order: stickers.length + uploaded,
        });
        if (insertError) throw insertError;
        uploaded++;
      } catch (err) {
        console.error("Upload error:", err);
      }
    }

    if (uploaded > 0) {
      toast.success(`${uploaded} sticker${uploaded > 1 ? "s" : ""} uploaded`);
      fetchStickers(activePack);
    } else {
      toast.error("Failed to upload stickers");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function deleteSticker(stickerId: string) {
    const { error } = await supabase.from("stickers").delete().eq("id", stickerId);
    if (error) {
      toast.error("Failed to delete sticker");
    } else {
      setStickers((prev) => prev.filter((s) => s.id !== stickerId));
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sticker className="w-5 h-5" />
            Sticker Packs
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sticker className="w-5 h-5" />
          Sticker Packs
        </CardTitle>
        <CardDescription>
          Create sticker packs and upload images. Everyone in chat can use them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create new pack */}
        <div className="flex gap-2">
          <Input
            placeholder="New pack name..."
            value={newPackName}
            onChange={(e) => setNewPackName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createPack()}
          />
          <Button onClick={createPack} disabled={creating || !newPackName.trim()} size="sm">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>

        {packs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Sticker className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No sticker packs yet</p>
            <p className="text-xs mt-1">Create one above to get started</p>
          </div>
        ) : (
          <>
            {/* Pack tabs */}
            <div className="flex gap-1 flex-wrap">
              {packs.map((pack) => (
                <div key={pack.id} className="flex items-center gap-0.5">
                  <button
                    onClick={() => setActivePack(pack.id)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                      activePack === pack.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {pack.name}
                  </button>
                  <button
                    onClick={() => deletePack(pack.id)}
                    disabled={deleting === pack.id}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded"
                  >
                    {deleting === pack.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Upload button */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleStickerUpload}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !activePack}
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {uploading ? "Uploading..." : "Upload Stickers"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                Select multiple images at once. PNG with transparency works best.
              </p>
            </div>

            {/* Sticker grid */}
            <ScrollArea className="h-56">
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-1">
                {stickers.map((sticker) => (
                  <div
                    key={sticker.id}
                    className="relative group aspect-square rounded-lg border border-border/50 p-1 flex items-center justify-center"
                  >
                    <img
                      src={sticker.image_url}
                      alt={sticker.label || "Sticker"}
                      className="w-full h-full object-contain"
                    />
                    <button
                      onClick={() => deleteSticker(sticker.id)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full items-center justify-center text-[10px] hidden group-hover:flex"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {stickers.length === 0 && (
                  <div className="col-span-full text-center py-6 text-xs text-muted-foreground">
                    No stickers yet — upload some above
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
