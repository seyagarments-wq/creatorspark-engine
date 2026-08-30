import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSecret } from "../_shared/secrets.ts";

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

async function getAccessToken(): Promise<string> {
  const shopDomain = (await getSecret("SHOPIFY_STORE_DOMAIN"));
  const directToken = (await getSecret("SHOPIFY_ACCESS_TOKEN"));
  if (directToken) return directToken;

  const clientId = (await getSecret("SHOPIFY_CLIENT_ID"));
  const clientSecret = (await getSecret("SHOPIFY_CLIENT_SECRET"));

  if (!shopDomain || !clientId || !clientSecret) {
    throw new Error("Missing Shopify credentials");
  }


  console.log("Requesting access token for shop:", shopDomain);

  const tokenUrl = `https://${shopDomain}/admin/oauth/access_token`;
  
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Token request failed:", response.status, errorText);
    throw new Error(`Failed to get access token: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log("Successfully obtained access token");
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const shopDomain = (await getSecret("SHOPIFY_STORE_DOMAIN"));
    if (!shopDomain) {
      throw new Error("SHOPIFY_STORE_DOMAIN not configured");
    }

    const accessToken = await getAccessToken();

    // Fetch active products from Shopify
    const productsUrl = `https://${shopDomain}/admin/api/2024-01/products.json?status=active&limit=50`;
    
    console.log("Fetching products from Shopify...");
    
    const response = await fetch(productsUrl, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

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
