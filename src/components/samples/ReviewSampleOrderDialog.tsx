import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { functionErrorMessage } from "@/lib/function-error";
import { useShopifyProducts, variantIndex } from "@/hooks/use-shopify-products";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { isStaleClaim, sizeLabel, type SampleItem } from "../../../supabase/functions/_shared/sample-order";

const DROP_REASONS = ["Out of stock", "Not available for samples", "Already sent to you"];

export interface ReviewableRequest {
  id: string;
  status: string;
  items: SampleItem[];
  shopify_order_claimed_at: string | null;
  creator: { full_name: string } | null;
}

interface Props {
  request: ReviewableRequest | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

/**
 * Approve a sample order: untick items to drop them (with a reason the creator sees), then one
 * Shopify order is made from what's left. Stock comes live from Shopify.
 */
export function ReviewSampleOrderDialog({ request, onOpenChange, onDone }: Props) {
  const { toast } = useToast();
  const { data: products, isLoading: stockLoading, isError: stockError } = useShopifyProducts();
  const stock = useMemo(() => variantIndex(products), [products]);
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!request) return;
    setKeep(Object.fromEntries(request.items.map((i) => [i.shopify_product_id, !i.removed_at])));
    setReason(Object.fromEntries(request.items.map((i) => [i.shopify_product_id, i.removed_reason || DROP_REASONS[0]])));
  }, [request]);

  if (!request) return null;
  const kept = request.items.filter((i) => keep[i.shopify_product_id]);
  const claimed = request.status === "requested" && !!request.shopify_order_claimed_at;
  // A fresh claim is a call that may still be running: never race it. A stale one is a dead call
  // the function lets us take over (atomically, server side).
  const stuck = claimed && isStaleClaim(request.shopify_order_claimed_at);
  const inFlight = claimed && !stuck;

  async function approve() {
    if (!request || kept.length === 0) return;
    setBusy(true);
    try {
      // Save drops (and un-drops) first; the function orders whatever isn't removed.
      for (const i of request.items) {
        if (!i.id) continue; // legacy single-item row, nothing to toggle
        const drop = !keep[i.shopify_product_id];
        if (drop === !!i.removed_at && (!drop || reason[i.shopify_product_id] === i.removed_reason)) continue;
        const { error } = await supabase
          .from("sample_request_items")
          .update(drop ? { removed_at: new Date().toISOString(), removed_reason: reason[i.shopify_product_id] } : { removed_at: null, removed_reason: null })
          .eq("id", i.id);
        if (error) throw new Error(`Couldn't update ${i.product_title}: ${error.message}`);
      }

      const { data, error } = await supabase.functions.invoke("shopify-create-sample-order", {
        body: { sampleRequestId: request.id, takeOver: stuck },
      });
      if (error) throw new Error(await functionErrorMessage(error, "Couldn't create the Shopify order."));
      if (data?.error) throw new Error(data.error);

      if (data?.dryRun) {
        toast({
          title: `Dry run: 1 order, ${data.lineCount} ${data.lineCount === 1 ? "line" : "lines"}`,
          description: `${data.reason} The request is still pending.`,
        });
      } else {
        toast({
          title: `Order ${data?.orderName ?? "created"}`,
          description: `${data?.lineCount} ${data?.lineCount === 1 ? "item" : "items"} in one Shopify order. The creator has been notified.`,
        });
      }
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast({ title: "Approval failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review sample order</DialogTitle>
          <DialogDescription>
            {request.creator?.full_name} asked for {request.items.length} {request.items.length === 1 ? "item" : "items"}.
            Untick anything you won't send. The rest goes out as one Shopify order.
          </DialogDescription>
        </DialogHeader>

        {inFlight && (
          <Alert>
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>
              This order is being placed right now (started {new Date(request.shopify_order_claimed_at!).toLocaleTimeString()}).
              Give it a few minutes, then refresh.
            </AlertDescription>
          </Alert>
        )}

        {stuck && (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>
              An order attempt started {new Date(request.shopify_order_claimed_at!).toLocaleString()} and didn't finish.
              Approving again first checks whether Shopify already made the order and records it if so. If
              you placed an order for this creator by hand, reject instead.
            </AlertDescription>
          </Alert>
        )}

        <ul className="divide-y rounded-lg border">
          {request.items.map((i) => {
            const on = !!keep[i.shopify_product_id];
            const v = stock.get(i.shopify_variant_id);
            const size = sizeLabel(i.variant_title);
            return (
              <li key={i.shopify_product_id} className="p-3 space-y-2">
                {/* Not a <label> wrapper: the checkbox is a button, and a label around it re-clicks it,
                    toggling twice. The name is a label pointing at it instead. */}
                <div className="flex items-center gap-3">
                  <Checkbox
                    id={`keep-${i.shopify_product_id}`}
                    checked={on}
                    onCheckedChange={(c) => setKeep((k) => ({ ...k, [i.shopify_product_id]: c === true }))}
                    disabled={busy || !i.id}
                  />
                  {i.product_image ? (
                    <img src={i.product_image} alt="" className={cn("w-10 h-10 rounded object-cover", !on && "opacity-40")} />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                      <Package className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <label htmlFor={`keep-${i.shopify_product_id}`} className="min-w-0 flex-1 cursor-pointer">
                    <p className={cn("text-sm font-medium truncate", !on && "line-through text-muted-foreground")}>{i.product_title}</p>
                    <p className="text-xs text-muted-foreground">
                      {size ? `Size ${size}` : "One size"}
                      {v?.sku ? ` · ${v.sku}` : ""}
                    </p>
                    {v && (v.product.id !== i.shopify_product_id || v.product.title !== i.product_title || v.title !== (i.variant_title ?? v.title)) && (
                      <p className="text-xs text-destructive">
                        Shopify says: {v.product.title}{sizeLabel(v.title) ? ` (${sizeLabel(v.title)})` : ""}
                      </p>
                    )}
                  </label>
                  {stockLoading ? null : stockError ? (
                    <Badge variant="outline" className="text-[11px] shrink-0">Stock unknown</Badge>
                  ) : v ? (
                    <Badge variant={v.inventory > 0 ? "outline" : "destructive"} className="text-[11px] shrink-0">
                      {v.inventory > 0 ? `${v.inventory} in stock` : "Out of stock"}
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[11px] shrink-0">Not in store</Badge>
                  )}
                </div>
                {!on && (
                  <div className="pl-7">
                    <Select value={reason[i.shopify_product_id]} onValueChange={(r) => setReason((m) => ({ ...m, [i.shopify_product_id]: r }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DROP_REASONS.map((r) => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {kept.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing left to send. Reject the request instead.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="success" onClick={approve} disabled={busy || kept.length === 0 || inFlight}>
            <CheckCircle className="w-4 h-4 mr-2" />
            {busy ? "Ordering…" : stuck ? `Retry order (${kept.length})` : `Approve & Order (${kept.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
