import { useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Check, Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useShopifyProducts, type ShopifyProduct } from "@/hooks/use-shopify-products";
import { SAMPLE_ORDER_MAX_ITEMS, sizeLabel, type BoxItem } from "../../../supabase/functions/_shared/sample-order";

interface SamplePickerProps {
  box: BoxItem[];
  onPick: (item: BoxItem) => void;
  onRemove: (productId: string) => void;
}

/**
 * Product grid → size chips. Picking a size hands the item to the parent's box and returns to
 * the grid, so adding the next item is one tap away. A product already in the box shows its
 * size; picking another size of it swaps (the parent's addToBox decides).
 */
export function SamplePicker({ box, onPick, onRemove }: SamplePickerProps) {
  const { data: products = [], isLoading, error, refetch } = useShopifyProducts();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ShopifyProduct | null>(null);

  const inBox = useMemo(() => new Map(box.map((b) => [b.productId, b])), [box]);
  const full = box.length >= SAMPLE_ORDER_MAX_ITEMS;
  // Only grey out sizes when the store actually tracks stock. An untracked catalog reports 0
  // everywhere, and that must not make every size unpickable.
  const tracksStock = useMemo(() => products.some((p) => p.variants.some((v) => v.inventory > 0)), [products]);

  const shown = products.filter((p) => p.title.toLowerCase().includes(query.trim().toLowerCase()));

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="aspect-[4/5] rounded-xl" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <AlertCircle className="w-9 h-9 text-destructive mx-auto mb-3" />
        <p className="text-sm text-destructive mb-3">{(error as Error).message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-10">
        <Package className="w-9 h-9 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No products available right now</p>
      </div>
    );
  }

  if (open) {
    const picked = inBox.get(open.id);
    const single = open.variants.length === 1;
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setOpen(null)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> All products
        </button>
        <div className="flex items-center gap-3">
          {open.image ? (
            <img src={open.image} alt="" className="w-16 h-16 rounded-lg object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
              <Package className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-medium leading-tight">{open.title}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {picked ? "In your box. Tap another size to swap." : single ? "One size" : "Pick a size"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {open.variants.map((v) => {
            const out = tracksStock && v.inventory <= 0;
            const selected = picked?.variantId === v.id;
            return (
              <button
                key={v.id}
                type="button"
                disabled={out}
                onClick={() => {
                  onPick({
                    productId: open.id,
                    productTitle: open.title,
                    productImage: open.image,
                    variantId: v.id,
                    variantTitle: v.title,
                  });
                  setOpen(null);
                }}
                className={cn(
                  "min-w-[3.25rem] h-11 px-4 rounded-lg border text-sm font-medium transition-colors",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary",
                  out && "opacity-40 line-through cursor-not-allowed hover:border-border",
                )}
                aria-label={`${sizeLabel(v.title) ?? "One size"}${out ? ", out of stock" : ""}`}
              >
                {sizeLabel(v.title) ?? "Add"}
              </button>
            );
          })}
        </div>

        {picked && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              onRemove(open.id);
              setOpen(null);
            }}
          >
            Remove from box
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search products" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
      </div>

      {full && (
        <p className="text-xs text-muted-foreground">
          Box is full ({SAMPLE_ORDER_MAX_ITEMS} items). Remove one to add something else.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {shown.map((p) => {
          const picked = inBox.get(p.id);
          const locked = full && !picked;
          return (
            <button
              key={p.id}
              type="button"
              disabled={locked}
              onClick={() => setOpen(p)}
              className={cn(
                "relative text-left rounded-xl border p-2 transition-all",
                picked ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/60",
                locked && "opacity-40 cursor-not-allowed hover:border-border",
              )}
            >
              {p.image ? (
                <img src={p.image} alt="" className="w-full aspect-square object-cover rounded-lg" />
              ) : (
                <div className="w-full aspect-square rounded-lg bg-muted flex items-center justify-center">
                  <Package className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <p className="text-sm font-medium leading-tight line-clamp-2 mt-2">{p.title}</p>
              {picked && (
                <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold px-2 py-0.5">
                  <Check className="w-3 h-3" /> {sizeLabel(picked.variantTitle) ?? "Added"}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {shown.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No products match "{query}"</p>}
    </div>
  );
}
