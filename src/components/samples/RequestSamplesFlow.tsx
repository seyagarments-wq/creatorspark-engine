import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Package, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SamplePicker } from "./SamplePicker";
import {
  SAMPLE_ORDER_MAX_ITEMS,
  addToBox,
  boxToRpcItems,
  removeFromBox,
  sizeLabel,
  type BoxItem,
} from "../../../supabase/functions/_shared/sample-order";

export interface ShippingDetails {
  country: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface Brand {
  id: string;
  name: string;
}

interface RequestSamplesFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: Brand[];
  /** Pre-fills step 2 from the creator's last request. */
  lastShipping: ShippingDetails | null;
  onSubmitted: () => void;
}

const EMPTY_SHIPPING: ShippingDetails = { country: "US", address: "", city: "", state: "", zip: "" };

const COUNTRIES: Record<string, { name: string; state: string; statePh: string; zip: string; zipPh: string }> = {
  US: { name: "🇺🇸 United States", state: "State", statePh: "CA", zip: "ZIP", zipPh: "90210" },
  CA: { name: "🇨🇦 Canada", state: "Province", statePh: "ON", zip: "Postal code", zipPh: "M5V 2T6" },
  GB: { name: "🇬🇧 United Kingdom", state: "County", statePh: "London", zip: "Postcode", zipPh: "SW1A 1AA" },
  AU: { name: "🇦🇺 Australia", state: "State", statePh: "NSW", zip: "Postcode", zipPh: "2000" },
  SG: { name: "🇸🇬 Singapore", state: "Region", statePh: "Central", zip: "Postal code", zipPh: "018956" },
};

export function RequestSamplesFlow({ open, onOpenChange, brands, lastShipping, onSubmitted }: RequestSamplesFlowProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [step, setStep] = useState<"pick" | "ship">("pick");
  const [box, setBox] = useState<BoxItem[]>([]);
  const [brandId, setBrandId] = useState("");
  const [ship, setShip] = useState<ShippingDetails>(EMPTY_SHIPPING);
  const [submitting, setSubmitting] = useState(false);

  // Fresh flow each time it opens (empty box, address from the last request), and only then:
  // a parent re-render while the sheet is open must not wipe the box.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setStep("pick");
      setBox([]);
      setShip(lastShipping ?? EMPTY_SHIPPING);
    }
    wasOpen.current = open;
  }, [open, lastShipping]);

  // Brands can arrive after the sheet is first rendered; default to the first one.
  useEffect(() => {
    if (!brandId && brands[0]) setBrandId(brands[0].id);
  }, [brands, brandId]);

  const labels = COUNTRIES[ship.country] ?? COUNTRIES.US;
  const set = (k: keyof ShippingDetails) => (e: React.ChangeEvent<HTMLInputElement>) => setShip((s) => ({ ...s, [k]: e.target.value }));

  function pick(item: BoxItem) {
    const r = addToBox(box, item);
    if (r.outcome === "full") {
      toast({ title: "Box is full", description: `Up to ${SAMPLE_ORDER_MAX_ITEMS} items per request.` });
    }
    setBox(r.box);
  }

  async function submit() {
    if (box.length === 0 || !ship.address.trim() || !brandId) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("create_sample_request", {
      p_brand_id: brandId,
      p_items: boxToRpcItems(box),
      p_shipping_address: ship.address,
      p_shipping_city: ship.city,
      p_shipping_state: ship.state,
      p_shipping_zip: ship.zip,
      p_shipping_country: ship.country,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Couldn't send your request", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Request sent",
      description: box.length === 1 ? "Your sample request is waiting for approval." : `${box.length} items in one package, waiting for approval.`,
    });
    onOpenChange(false);
    onSubmitted();
  }

  const title = step === "pick" ? "Request samples" : "Where should we send it?";
  const subtitle =
    step === "pick"
      ? `Pick up to ${SAMPLE_ORDER_MAX_ITEMS} items, one size each. They ship together.`
      : "Check your address. Everything ships in one package.";

  const body =
    step === "pick" ? (
      <SamplePicker box={box} onPick={pick} onRemove={(id) => setBox((b) => removeFromBox(b, id))} />
    ) : (
      <div className="space-y-4">
        <div className="rounded-xl border divide-y">
          {box.map((b) => (
            <div key={b.productId} className="flex items-center gap-3 p-2.5">
              {b.productImage ? (
                <img src={b.productImage} alt="" className="w-10 h-10 rounded-md object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                  <Package className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{b.productTitle}</p>
                {sizeLabel(b.variantTitle) && <p className="text-xs text-muted-foreground">Size {sizeLabel(b.variantTitle)}</p>}
              </div>
            </div>
          ))}
        </div>

        {brands.length > 1 && (
          <div className="space-y-2">
            <Label>Brand</Label>
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
              <SelectContent>
                {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>Country</Label>
          <Select value={ship.country} onValueChange={(country) => setShip((s) => ({ ...s, country }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(COUNTRIES).map(([code, c]) => <SelectItem key={code} value={code}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Street address</Label>
          <Input placeholder="Street address" value={ship.address} onChange={set("address")} autoComplete="street-address" />
        </div>
        <div className="grid grid-cols-[1fr_5rem_6rem] gap-2">
          <div className="space-y-2">
            <Label>City</Label>
            <Input placeholder="City" value={ship.city} onChange={set("city")} autoComplete="address-level2" />
          </div>
          <div className="space-y-2">
            <Label>{labels.state}</Label>
            <Input placeholder={labels.statePh} value={ship.state} onChange={set("state")} autoComplete="address-level1" />
          </div>
          <div className="space-y-2">
            <Label>{labels.zip}</Label>
            <Input placeholder={labels.zipPh} value={ship.zip} onChange={set("zip")} autoComplete="postal-code" />
          </div>
        </div>
      </div>
    );

  const footer =
    step === "pick" ? (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {Array.from({ length: SAMPLE_ORDER_MAX_ITEMS }).map((_, i) => {
            const b = box[i];
            return b ? (
              <button
                key={b.productId}
                type="button"
                onClick={() => setBox((cur) => removeFromBox(cur, b.productId))}
                className="relative w-10 h-10 rounded-md overflow-hidden border shrink-0 group"
                aria-label={`Remove ${b.productTitle}`}
              >
                {b.productImage ? (
                  <img src={b.productImage} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-4 h-4 m-auto text-muted-foreground" />
                )}
                <span className="absolute -top-0 -right-0 bg-background/90 rounded-bl-md p-0.5">
                  <X className="w-3 h-3" />
                </span>
              </button>
            ) : (
              <div key={`empty-${i}`} className="w-10 h-10 rounded-md border border-dashed shrink-0" />
            );
          })}
          <span className="text-xs text-muted-foreground ml-1 whitespace-nowrap">{box.length}/{SAMPLE_ORDER_MAX_ITEMS}</span>
        </div>
        <Button variant="success" disabled={box.length === 0} onClick={() => setStep("ship")}>
          Next
        </Button>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => setStep("pick")} disabled={submitting}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Items
        </Button>
        <Button
          variant="success"
          className="flex-1"
          disabled={submitting || !ship.address.trim() || !brandId}
          onClick={submit}
        >
          {submitting ? "Sending…" : `Request ${box.length} ${box.length === 1 ? "item" : "items"}`}
        </Button>
      </div>
    );

  const content = (
    <>
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4">{body}</div>
      <div className={cn("border-t bg-background px-4 sm:px-6 py-3", isMobile && "pb-[max(0.75rem,env(safe-area-inset-bottom))]")}>{footer}</div>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[92dvh] p-0 flex flex-col rounded-t-2xl gap-0"
          // Focusing the search box on open would throw up the phone keyboard over the grid.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader className="px-4 pt-5 pb-3 text-left">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{subtitle}</SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 max-h-[88vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
