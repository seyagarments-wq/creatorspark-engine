import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, Package, AlertCircle } from "lucide-react";

interface ProductVariant {
  id: string;
  title: string;
  price: string;
  inventory: number;
  sku: string;
}

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  image: string | null;
  variants: ProductVariant[];
}

interface ShopifyProductPickerProps {
  onSelect: (product: ShopifyProduct, variant: ProductVariant) => void;
  selectedProductId?: string;
  selectedVariantId?: string;
}

export function ShopifyProductPicker({
  onSelect,
  selectedProductId,
  selectedVariantId,
}: ShopifyProductPickerProps) {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ShopifyProduct | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fnError } = await supabase.functions.invoke(
        "shopify-get-products"
      );

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setProducts(data.products || []);

      // If there's a pre-selected product, find and set it
      if (selectedProductId) {
        const preSelected = data.products?.find(
          (p: ShopifyProduct) => p.id === selectedProductId
        );
        if (preSelected) {
          setSelectedProduct(preSelected);
        }
      }
    } catch (err: any) {
      console.error("Failed to fetch products:", err);
      setError(err.message || "Failed to load products from Shopify");
    } finally {
      setLoading(false);
    }
  }

  const filteredProducts = products.filter((product) =>
    product.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function handleProductSelect(product: ShopifyProduct) {
    setSelectedProduct(product);
    // If product has only one variant, auto-select it
    if (product.variants.length === 1) {
      onSelect(product, product.variants[0]);
    }
  }

  function handleVariantSelect(variantId: string) {
    if (!selectedProduct) return;
    const variant = selectedProduct.variants.find((v) => v.id === variantId);
    if (variant) {
      onSelect(selectedProduct, variant);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
        <p className="text-sm text-destructive mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchProducts}>
          Try Again
        </Button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-8">
        <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No products available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Product Grid */}
      {!selectedProduct ? (
        <ScrollArea className="h-[300px]">
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => handleProductSelect(product)}
                className={`p-3 rounded-lg border text-left transition-all hover:border-primary ${
                  selectedProductId === product.id
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
              >
                {product.image ? (
                  <img
                    src={product.image}
                    alt={product.title}
                    className="w-full h-20 object-cover rounded mb-2"
                  />
                ) : (
                  <div className="w-full h-20 bg-muted rounded mb-2 flex items-center justify-center">
                    <Package className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <p className="text-sm font-medium line-clamp-2">{product.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {product.variants.length} variant
                  {product.variants.length !== 1 ? "s" : ""}
                </p>
              </button>
            ))}
          </div>
        </ScrollArea>
      ) : (
        /* Variant Selection */
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedProduct(null)}
            >
              ← Back
            </Button>
            <div className="flex items-center gap-2">
              {selectedProduct.image && (
                <img
                  src={selectedProduct.image}
                  alt={selectedProduct.title}
                  className="w-10 h-10 object-cover rounded"
                />
              )}
              <span className="font-medium">{selectedProduct.title}</span>
            </div>
          </div>

          <Label>Select Variant</Label>
          <RadioGroup
            value={selectedVariantId}
            onValueChange={handleVariantSelect}
          >
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {selectedProduct.variants.map((variant) => (
                  <label
                    key={variant.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all hover:border-primary ${
                      selectedVariantId === variant.id
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value={variant.id} />
                      <div>
                        <p className="font-medium">{variant.title}</p>
                        {variant.sku && (
                          <p className="text-xs text-muted-foreground">
                            SKU: {variant.sku}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${variant.price}</p>
                      <Badge
                        variant={variant.inventory > 0 ? "outline" : "destructive"}
                        className="text-xs"
                      >
                        {variant.inventory > 0
                          ? `${variant.inventory} in stock`
                          : "Out of stock"}
                      </Badge>
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </RadioGroup>
        </div>
      )}
    </div>
  );
}
