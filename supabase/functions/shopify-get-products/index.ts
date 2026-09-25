import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { shopifyFetch } from "../_shared/shopify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  status: string;
  images: { src: string }[];
  variants: {
    id: string;
    title: string;
    price: string;
    inventory_quantity: number;
    sku: string;
  }[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Active products only. 250 is Shopify's page maximum; the catalog is well under that.
    const response = await shopifyFetch("products.json?status=active&limit=250");

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Shopify API error:", response.status, errorText);
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    const products: ShopifyProduct[] = data.products || [];

    console.log(`Fetched ${products.length} products from Shopify`);

    // Transform products for frontend consumption
    const transformedProducts = products.map((product) => ({
      id: product.id.toString(),
      title: product.title,
      handle: product.handle,
      image: product.images[0]?.src || null,
      variants: product.variants.map((variant) => ({
        id: variant.id.toString(),
        title: variant.title,
        price: variant.price,
        inventory: variant.inventory_quantity,
        sku: variant.sku,
      })),
    }));

    return new Response(JSON.stringify({ products: transformedProducts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Error in shopify-get-products:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
