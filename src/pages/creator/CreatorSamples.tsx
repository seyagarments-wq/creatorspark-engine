import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
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
import { ShopifyProductPicker } from "@/components/samples/ShopifyProductPicker";
import { useIsMobile } from "@/hooks/use-mobile";

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
  brand: {
    id: string;
    name: string;
  } | null;
}

interface Brand {
  id: string;
  name: string;
}

interface SelectedShopifyProduct {
  productId: string;
  productTitle: string;
  productImage: string | null;
  variantId: string;
  variantTitle: string;
}

export default function CreatorSamples() {
  const isMobile = useIsMobile();
  const { profileId } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<SampleRequest[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<SelectedShopifyProduct | null>(null);
  const [shippingCountry, setShippingCountry] = useState("US");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  // Country-aware labels
  const countryConfig: Record<string, { stateLabel: string; statePlaceholder: string; zipLabel: string; zipPlaceholder: string }> = {
    US: { stateLabel: "State", statePlaceholder: "CA", zipLabel: "ZIP", zipPlaceholder: "90210" },
    CA: { stateLabel: "Province", statePlaceholder: "ON", zipLabel: "Postal Code", zipPlaceholder: "M5V 2T6" },
    GB: { stateLabel: "County", statePlaceholder: "London", zipLabel: "Postcode", zipPlaceholder: "SW1A 1AA" },
    AU: { stateLabel: "State", statePlaceholder: "NSW", zipLabel: "Postcode", zipPlaceholder: "2000" },
    SG: { stateLabel: "Region", statePlaceholder: "Central", zipLabel: "Postal Code", zipPlaceholder: "018956" },
  };
  const addrLabels = countryConfig[shippingCountry] || countryConfig.US;

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
          brand:brands(id, name)
        `)
        .eq("creator_id", profileId)
        .order("created_at", { ascending: false });

      if (requestsError) throw requestsError;
      setRequests(requestsData || []);

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

      if (brandsList.length > 0 && !selectedBrandId) {
        setSelectedBrandId(brandsList[0].id);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitRequest() {
    if (!selectedProduct || !address.trim() || !selectedBrandId) {
      toast({
        title: "Missing information",
        description: "Please select a product and fill in shipping address",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("sample_requests").insert({
        creator_id: profileId,
        brand_id: selectedBrandId,
        product_name: selectedProduct.productTitle,
        product_description: selectedProduct.variantTitle !== "Default Title" 
          ? selectedProduct.variantTitle 
          : null,
        shipping_address: address.trim(),
        shipping_city: city.trim() || null,
        shipping_state: state.trim() || null,
        shipping_zip: zip.trim() || null,
        shipping_country: shippingCountry,
        shopify_product_id: selectedProduct.productId,
        shopify_variant_id: selectedProduct.variantId,
        shopify_product_title: selectedProduct.productTitle,
        shopify_variant_title: selectedProduct.variantTitle,
        shopify_product_image: selectedProduct.productImage,
      });

      if (error) throw error;

      toast({
        title: "Request submitted!",
        description: "Your sample request has been sent for approval.",
      });

      // Reset form
      setSelectedProduct(null);
      setAddress("");
      setCity("");
      setState("");
      setZip("");
      setDialogOpen(false);
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to submit request";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
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
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="success" size={isMobile ? "sm" : "default"} disabled={brands.length === 0} className="shrink-0">
                <Plus className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Request Sample</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Request Product Sample</DialogTitle>
                <DialogDescription>
                  Select a product from our catalog and provide your shipping details.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Brand *</Label>
                  <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select brand" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map(brand => (
                        <SelectItem key={brand.id} value={brand.id}>
                          {brand.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Select Product *</Label>
                  <ShopifyProductPicker
                    onSelect={(product, variant) => {
                      setSelectedProduct({
                        productId: product.id,
                        productTitle: product.title,
                        productImage: product.image,
                        variantId: variant.id,
                        variantTitle: variant.title,
                      });
                    }}
                    selectedProductId={selectedProduct?.productId}
                    selectedVariantId={selectedProduct?.variantId}
                  />
                  {selectedProduct && (
                    <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
                      <div className="flex items-center gap-3">
                        {selectedProduct.productImage && (
                          <img 
                            src={selectedProduct.productImage} 
                            alt={selectedProduct.productTitle}
                            className="w-12 h-12 object-cover rounded"
                          />
                        )}
                        <div>
                          <p className="font-medium text-sm">{selectedProduct.productTitle}</p>
                          {selectedProduct.variantTitle !== "Default Title" && (
                            <p className="text-xs text-muted-foreground">{selectedProduct.variantTitle}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Country *</Label>
                  <Select value={shippingCountry} onValueChange={setShippingCountry}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="US">🇺🇸 United States</SelectItem>
                      <SelectItem value="CA">🇨🇦 Canada</SelectItem>
                      <SelectItem value="GB">🇬🇧 United Kingdom</SelectItem>
                      <SelectItem value="AU">🇦🇺 Australia</SelectItem>
                      <SelectItem value="SG">🇸🇬 Singapore</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Shipping Address *</Label>
                  <Input
                    placeholder="Street address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      placeholder="City"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{addrLabels.stateLabel}</Label>
                    <Input
                      placeholder={addrLabels.statePlaceholder}
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{addrLabels.zipLabel}</Label>
                    <Input
                      placeholder={addrLabels.zipPlaceholder}
                      value={zip}
                      onChange={(e) => setZip(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="success"
                  onClick={handleSubmitRequest}
                  disabled={submitting || !selectedProduct || !address.trim()}
                >
                  Submit Request
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
              Request product samples to create amazing content
            </p>
            {brands.length > 0 && (
              <Button variant="success" size={isMobile ? "sm" : "default"} onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Request Your First Sample
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
                      {request.shopify_product_image ? (
                        <img 
                          src={request.shopify_product_image} 
                          alt={request.product_name}
                          className="w-10 h-10 md:w-14 md:h-14 object-cover rounded-lg shrink-0"
                        />
                      ) : (
                        <div className="p-2 md:p-3 rounded-lg bg-muted shrink-0">
                          <Package className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5 md:mb-1 flex-wrap">
                          <h3 className="font-medium text-sm md:text-base truncate">{request.product_name}</h3>
                          {getStatusBadge(request.status)}
                        </div>
                        {!isMobile && request.shopify_variant_title && request.shopify_variant_title !== "Default Title" && (
                          <p className="text-sm text-muted-foreground mb-1">
                            {request.shopify_variant_title}
                          </p>
                        )}
                        {request.brand && (
                          <p className="text-xs md:text-sm text-muted-foreground truncate">
                            {request.brand.name}
                          </p>
                        )}
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
                  
                  <CollapsibleContent className="mt-6 pt-6 border-t">
                    <ShippingTimeline
                      status={request.status}
                      createdAt={request.created_at}
                      shippedAt={request.shipped_at}
                      deliveredAt={request.delivered_at}
                    />
                    
                    {request.tracking_number && (
                      <div className="mt-4 p-3 bg-muted rounded-lg">
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
