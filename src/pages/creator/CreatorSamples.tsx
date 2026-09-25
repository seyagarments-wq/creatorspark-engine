import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  Plus,
  Truck,
  CheckCircle,
  Clock,
  XCircle,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { ShippingTimeline } from "@/components/samples/ShippingTimeline";
import { RequestSamplesFlow, type ShippingDetails } from "@/components/samples/RequestSamplesFlow";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  activeItems,
  itemsSummary,
  requestItems,
  sizeLabel,
  type SampleItem,
} from "../../../supabase/functions/_shared/sample-order";

interface SampleRequest {
  id: string;
  product_name: string;
  product_description: string | null;
  shipping_address: string;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  status: string;
  tracking_number: string | null;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  shopify_product_title: string | null;
  shopify_variant_title: string | null;
  shopify_product_image: string | null;
  shipping_country: string | null;
  items: SampleItem[];
  brand: {
    id: string;
    name: string;
  } | null;
}

interface Brand {
  id: string;
  name: string;
}

export default function CreatorSamples() {
  const isMobile = useIsMobile();
  const { profileId } = useAuth();
  const [requests, setRequests] = useState<SampleRequest[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [flowOpen, setFlowOpen] = useState(false);

  // Step 2 of the request flow starts from the address on their latest request.
  const lastShipping = useMemo<ShippingDetails | null>(() => {
    const last = requests[0];
    if (!last) return null;
    return {
      country: last.shipping_country || "US",
      address: last.shipping_address || "",
      city: last.shipping_city || "",
      state: last.shipping_state || "",
      zip: last.shipping_zip || "",
    };
  }, [requests]);

  useEffect(() => {
    if (profileId) {
      fetchData();
    }
  }, [profileId]);

  async function fetchData() {
    try {
      // Fetch sample requests
      const { data: requestsData, error: requestsError } = await supabase
        .from("sample_requests")
        .select(`
          *,
          items:sample_request_items(*),
          brand:brands(id, name)
        `)
        .eq("creator_id", profileId)
        .order("created_at", { ascending: false });

      if (requestsError) throw requestsError;
      setRequests((requestsData || []).map((r) => ({ ...r, items: requestItems(r, r.items) })));

      // Fetch brands the creator is associated with
      const { data: creatorBrands, error: brandsError } = await supabase
        .from("creator_brands")
        .select("brand:brands(id, name)")
        .eq("creator_id", profileId)
        .eq("status", "active");

      if (brandsError) throw brandsError;
      
      const brandsList = creatorBrands
        ?.map(cb => cb.brand)
        .filter((b): b is Brand => b !== null) || [];
      setBrands(brandsList);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "requested":
        return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> Pending</Badge>;
      case "approved":
        return <Badge className="bg-info/10 text-info gap-1"><CheckCircle className="w-3 h-3" /> Approved</Badge>;
      case "shipped":
        return <Badge className="bg-warning/10 text-warning gap-1"><Truck className="w-3 h-3" /> Shipped</Badge>;
      case "delivered":
        return <Badge className="bg-success/10 text-success gap-1"><CheckCircle className="w-3 h-3" /> Delivered</Badge>;
      case "cancelled":
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === "requested" || r.status === "approved").length,
    shipped: requests.filter(r => r.status === "shipped").length,
    delivered: requests.filter(r => r.status === "delivered").length,
  };

  if (loading) {
    return (
      <CreatorLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout>
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold truncate">Sample Requests</h1>
            <p className="text-xs md:text-sm text-muted-foreground hidden md:block">Request product samples for your content</p>
          </div>
          <Button
            variant="success"
            size={isMobile ? "sm" : "default"}
            disabled={brands.length === 0}
            className="shrink-0"
            onClick={() => setFlowOpen(true)}
          >
            <Plus className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">Request Samples</span>
          </Button>
          <RequestSamplesFlow
            open={flowOpen}
            onOpenChange={setFlowOpen}
            brands={brands}
            lastShipping={lastShipping}
            onSubmitted={fetchData}
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 md:gap-4">
          <div className="stat-card p-2 md:p-4">
            <div className="flex flex-col md:flex-row items-center gap-1 md:gap-3">
              <div className="p-2 md:p-3 rounded-lg bg-primary/10">
                <Package className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              </div>
              <div className="text-center md:text-left">
                <p className="text-lg md:text-2xl font-bold">{stats.total}</p>
                <p className="text-[10px] md:text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          </div>
          <div className="stat-card p-2 md:p-4">
            <div className="flex flex-col md:flex-row items-center gap-1 md:gap-3">
              <div className="p-2 md:p-3 rounded-lg bg-warning/10">
                <Clock className="w-4 h-4 md:w-5 md:h-5 text-warning" />
              </div>
              <div className="text-center md:text-left">
                <p className="text-lg md:text-2xl font-bold">{stats.pending}</p>
                <p className="text-[10px] md:text-sm text-muted-foreground">Pending</p>
              </div>
            </div>
          </div>
          <div className="stat-card p-2 md:p-4">
            <div className="flex flex-col md:flex-row items-center gap-1 md:gap-3">
              <div className="p-2 md:p-3 rounded-lg bg-info/10">
                <Truck className="w-4 h-4 md:w-5 md:h-5 text-info" />
              </div>
              <div className="text-center md:text-left">
                <p className="text-lg md:text-2xl font-bold">{stats.shipped}</p>
                <p className="text-[10px] md:text-sm text-muted-foreground">Transit</p>
              </div>
            </div>
          </div>
          <div className="stat-card p-2 md:p-4">
            <div className="flex flex-col md:flex-row items-center gap-1 md:gap-3">
              <div className="p-2 md:p-3 rounded-lg bg-success/10">
                <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-success" />
              </div>
              <div className="text-center md:text-left">
                <p className="text-lg md:text-2xl font-bold">{stats.delivered}</p>
                <p className="text-[10px] md:text-sm text-muted-foreground">Done</p>
              </div>
            </div>
          </div>
        </div>

        {/* Requests List */}
        {requests.length === 0 ? (
          <div className="stat-card text-center py-8 md:py-12">
            <Package className="w-10 h-10 md:w-12 md:h-12 text-muted-foreground mx-auto mb-3 md:mb-4" />
            <h3 className="font-medium mb-2 text-sm md:text-base">No sample requests yet</h3>
            <p className="text-xs md:text-sm text-muted-foreground mb-4">
              Pick up to 4 items. They ship together in one package.
            </p>
            {brands.length > 0 && (
              <Button variant="success" size={isMobile ? "sm" : "default"} onClick={() => setFlowOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Request Your First Samples
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2 md:space-y-4">
            {requests.map((request) => (
              <Collapsible key={request.id}>
                <div className="stat-card p-3 md:p-4">
                  <div className="flex items-center justify-between gap-2 md:gap-4">
                    <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
                      <ItemThumbs items={activeItems(request.items)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5 md:mb-1 flex-wrap">
                          <h3 className="font-medium text-sm md:text-base truncate">
                            {request.items.length ? itemsSummary(activeItems(request.items)) : request.product_name}
                          </h3>
                          {getStatusBadge(request.status)}
                        </div>
                        <p className="text-xs md:text-sm text-muted-foreground truncate">
                          {activeItems(request.items).length > 1 ? `${activeItems(request.items).length} items · ` : ""}
                          {request.brand?.name}
                        </p>
                        <p className="text-[10px] md:text-xs text-muted-foreground">
                          {formatDate(request.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 md:gap-2 shrink-0">
                      {request.tracking_number && (
                        <Button variant="outline" size="sm" asChild className="h-8 px-2 md:px-3">
                          <a
                            href={`https://track.aftership.com/${request.tracking_number}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-3 h-3 md:w-4 md:h-4 md:mr-2" />
                            <span className="hidden md:inline">Track</span>
                          </a>
                        </Button>
                      )}
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                  
                  <CollapsibleContent className="mt-4 pt-4 border-t space-y-5">
                    <ItemList items={request.items} showDrops={request.status !== "rejected"} />
                    <ShippingTimeline
                      status={request.status}
                      createdAt={request.created_at}
                      shippedAt={request.shipped_at}
                      deliveredAt={request.delivered_at}
                    />
                    
                    {request.tracking_number && (
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Tracking Number</p>
                        <p className="font-mono text-sm">{request.tracking_number}</p>
                      </div>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}
      </div>
    </CreatorLayout>
  );
}

/** Up to three overlapping thumbnails for an order. */
function ItemThumbs({ items }: { items: SampleItem[] }) {
  const shown = items.slice(0, 3);
  if (shown.length === 0) {
    return (
      <div className="p-2 md:p-3 rounded-lg bg-muted shrink-0">
        <Package className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="flex shrink-0 -space-x-4 md:-space-x-5">
      {shown.map((i, n) =>
        i.product_image ? (
          <img
            key={i.shopify_product_id}
            src={i.product_image}
            alt=""
            className="w-10 h-10 md:w-14 md:h-14 object-cover rounded-lg ring-2 ring-background"
            style={{ zIndex: shown.length - n }}
          />
        ) : (
          <div
            key={i.shopify_product_id}
            className="w-10 h-10 md:w-14 md:h-14 rounded-lg bg-muted ring-2 ring-background flex items-center justify-center"
            style={{ zIndex: shown.length - n }}
          >
            <Package className="w-4 h-4 text-muted-foreground" />
          </div>
        ),
      )}
    </div>
  );
}

/** Every item in the order; ones an admin dropped are struck through with the reason. */
function ItemList({ items, showDrops }: { items: SampleItem[]; showDrops: boolean }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {items.map((i) => {
        const dropped = showDrops && !!i.removed_at;
        const size = sizeLabel(i.variant_title);
        return (
          <li key={i.shopify_product_id} className="flex items-center gap-3">
            {i.product_image ? (
              <img src={i.product_image} alt="" className={`w-9 h-9 rounded-md object-cover ${dropped ? "opacity-40" : ""}`} />
            ) : (
              <div className="w-9 h-9 rounded-md bg-muted" />
            )}
            <div className="min-w-0">
              <p className={`text-sm truncate ${dropped ? "line-through text-muted-foreground" : "font-medium"}`}>
                {i.product_title}
                {size && <span className="text-muted-foreground font-normal"> · {size}</span>}
              </p>
              {dropped && (
                <p className="text-xs text-muted-foreground">Not included{i.removed_reason ? `: ${i.removed_reason}` : ""}</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
