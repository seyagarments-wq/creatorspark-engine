import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sticker, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StickerPack {
  id: string;
  name: string;
  icon_url: string | null;
  sort_order: number;
}

interface StickerItem {
  id: string;
  pack_id: string;
  image_url: string;
  label: string | null;
}

interface StickerPickerProps {
  onSelect: (stickerUrl: string) => void;
  disabled?: boolean;
  size?: "sm" | "default";
}

export function StickerPicker({ onSelect, disabled, size = "default" }: StickerPickerProps) {
  const [open, setOpen] = useState(false);
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [activePack, setActivePack] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchPacks();
  }, [open]);

  useEffect(() => {
    if (!activePack) return;
    fetchStickers(activePack);
  }, [activePack]);

  async function fetchPacks() {
    setLoading(true);
    const { data } = await supabase
      .from("sticker_packs")
      .select("id, name, icon_url, sort_order")
      .eq("is_active", true)
      .order("sort_order");

    if (data && data.length > 0) {
      setPacks(data);
      if (!activePack) setActivePack(data[0].id);
    }
    setLoading(false);
  }

  async function fetchStickers(packId: string) {
    const { data } = await supabase
      .from("stickers")
      .select("id, pack_id, image_url, label")
      .eq("pack_id", packId)
      .order("sort_order");

    setStickers(data || []);
  }

  function handleSelect(stickerUrl: string) {
    onSelect(stickerUrl);
    setOpen(false);
  }

  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const btnSize = size === "sm" ? "h-9 w-9" : "h-10 w-10";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          className={cn("shrink-0", btnSize)}
        >
          <Sticker className={iconSize} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        side="top"
        sideOffset={8}
      >
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : packs.length === 0 ? (
          <div className="text-center py-8 px-4">
            <Sticker className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No sticker packs yet</p>
            <p className="text-xs text-muted-foreground mt-1">Sticker packs can be added in Settings</p>
          </div>
        ) : (
          <>
            {/* Pack tabs */}
            <div className="flex border-b overflow-x-auto px-1 py-1 gap-0.5">
              {packs.map((pack) => (
                <button
                  key={pack.id}
                  onClick={() => setActivePack(pack.id)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors",
                    activePack === pack.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {pack.icon_url ? (
                    <img src={pack.icon_url} alt={pack.name} className="w-5 h-5 inline-block mr-1" />
                  ) : null}
                  {pack.name}
                </button>
              ))}
            </div>

            {/* Sticker grid */}
            <ScrollArea className="h-52">
              <div className="grid grid-cols-4 gap-1 p-2">
                {stickers.map((sticker) => (
                  <button
                    key={sticker.id}
                    onClick={() => handleSelect(sticker.image_url)}
                    className="aspect-square rounded-lg hover:bg-muted transition-colors p-1 flex items-center justify-center"
                    title={sticker.label || undefined}
                  >
                    <img
                      src={sticker.image_url}
                      alt={sticker.label || "Sticker"}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  </button>
                ))}
                {stickers.length === 0 && (
                  <div className="col-span-4 text-center py-6 text-xs text-muted-foreground">
                    No stickers in this pack
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
