import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { functionErrorMessage } from "@/lib/function-error";

export interface ShopifyVariant {
  id: string;
  title: string;
  price: string;
  inventory: number;
  sku: string;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  image: string | null;
  variants: ShopifyVariant[];
}

/** The live sample catalog from shopify-get-products. Shared by the creator picker and admin review. */
export function useShopifyProducts() {
  return useQuery({
    queryKey: ["shopify-products"],
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<ShopifyProduct[]> => {
      const { data, error } = await supabase.functions.invoke("shopify-get-products");
      if (error) throw new Error(await functionErrorMessage(error, "Couldn't load products from Shopify."));
      if (data?.error) throw new Error(data.error);
      return data?.products ?? [];
    },
  });
}

/** Variant id → the variant and its product, for stock and name checks. */
export function variantIndex(products: ShopifyProduct[] | undefined): Map<string, ShopifyVariant & { product: ShopifyProduct }> {
  const map = new Map<string, ShopifyVariant & { product: ShopifyProduct }>();
  for (const p of products ?? []) for (const v of p.variants) map.set(v.id, { ...v, product: p });
  return map;
}
