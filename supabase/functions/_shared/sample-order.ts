/**
 * Multi-item sample orders: the rules shared by the creator picker, the admin screen and
 * shopify-create-sample-order. Pure, no Deno or browser APIs, so vitest covers it.
 *
 * The database enforces the same rules (create_sample_request() and the unique constraint in
 * 20260925100000_sample_request_items.sql). Keep SAMPLE_ORDER_MAX_ITEMS in step with the SQL.
 */

export const SAMPLE_ORDER_MAX_ITEMS = 4;

/**
 * An order claim older than this belongs to a call that died (edge functions stop well before
 * it), so an admin may take it over. Anything younger is a call that may still be running.
 */
export const STALE_CLAIM_MS = 5 * 60 * 1000;

export const isStaleClaim = (claimedAt: string | null | undefined, now = Date.now()) =>
  !!claimedAt && now - new Date(claimedAt).getTime() > STALE_CLAIM_MS;

/** Whether a Shopify draft is the one this function made for this request (tag + id in the note). */
export const isOwnDraft = (draft: { note?: string | null; tags?: string | null }, requestId: string) =>
  (draft.tags ?? "").split(",").map((t) => t.trim()).includes("creator-sample") && (draft.note ?? "").includes(requestId);

export interface SampleItem {
  id?: string;
  position: number;
  shopify_product_id: string;
  shopify_variant_id: string;
  product_title: string;
  variant_title: string | null;
  product_image: string | null;
  removed_at?: string | null;
  removed_reason?: string | null;
}

/** The single-item columns every request row still carries (all rows before 2026-09-25). */
export interface LegacySampleColumns {
  product_name: string;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  shopify_product_title: string | null;
  shopify_variant_title: string | null;
  shopify_product_image: string | null;
}

/**
 * A request's items in order. Falls back to the legacy columns when the request has no item
 * rows (an app tab still running the old single-item bundle inserts that way).
 */
export function requestItems(request: LegacySampleColumns, items: SampleItem[] | null | undefined): SampleItem[] {
  if (items && items.length > 0) return [...items].sort((a, b) => a.position - b.position);
  if (!request.shopify_product_id || !request.shopify_variant_id) return [];
  return [{
    position: 0,
    shopify_product_id: request.shopify_product_id,
    shopify_variant_id: request.shopify_variant_id,
    product_title: request.shopify_product_title || request.product_name,
    variant_title: request.shopify_variant_title,
    product_image: request.shopify_product_image,
    removed_at: null,
    removed_reason: null,
  }];
}

export const activeItems = (items: SampleItem[]) => items.filter((i) => !i.removed_at);
export const removedItems = (items: SampleItem[]) => items.filter((i) => !!i.removed_at);

/** "M", or null for Shopify's placeholder on single-variant products. */
export function sizeLabel(variantTitle: string | null | undefined): string | null {
  const v = (variantTitle ?? "").trim();
  return v && v !== "Default Title" ? v : null;
}

/** "Daydream Hoodie — Pink (M)" */
export function itemLabel(item: Pick<SampleItem, "product_title" | "variant_title">): string {
  const size = sizeLabel(item.variant_title);
  return size ? `${item.product_title} (${size})` : item.product_title;
}

/** "Daydream Hoodie — Pink + 2 more", the same text create_sample_request() stores. */
export function itemsSummary(items: Pick<SampleItem, "product_title">[]): string {
  if (items.length === 0) return "No items";
  return items.length === 1 ? items[0].product_title : `${items[0].product_title} + ${items.length - 1} more`;
}

// ---------- the creator's box ----------

export interface BoxItem {
  productId: string;
  productTitle: string;
  productImage: string | null;
  variantId: string;
  variantTitle: string;
}

export type BoxResult = { box: BoxItem[]; outcome: "added" | "swapped" | "full" | "unchanged" };

/**
 * Put a size of a product in the box. The same product again swaps the size in place (one
 * size per product); a new product when the box is full is refused.
 */
export function addToBox(box: BoxItem[], item: BoxItem): BoxResult {
  const at = box.findIndex((b) => b.productId === item.productId);
  if (at >= 0) {
    if (box[at].variantId === item.variantId) return { box, outcome: "unchanged" };
    const next = [...box];
    next[at] = item;
    return { box: next, outcome: "swapped" };
  }
  if (box.length >= SAMPLE_ORDER_MAX_ITEMS) return { box, outcome: "full" };
  return { box: [...box, item], outcome: "added" };
}

export const removeFromBox = (box: BoxItem[], productId: string) => box.filter((b) => b.productId !== productId);

/** The p_items payload for create_sample_request(). */
export function boxToRpcItems(box: BoxItem[]) {
  return box.map((b) => ({
    product_id: b.productId,
    variant_id: b.variantId,
    product_title: b.productTitle,
    variant_title: b.variantTitle,
    image: b.productImage,
  }));
}

// ---------- Shopify ----------

export interface SampleOrderRequest {
  id: string;
  shipping_address: string;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  shipping_country: string | null;
}

export interface SampleOrderCreator {
  full_name: string | null;
  email: string | null;
}

/**
 * The Shopify draft order for a request: one line per item that wasn't dropped, 100% off.
 * Throws when nothing is left to send.
 */
export function buildSampleDraftOrder(request: SampleOrderRequest, creator: SampleOrderCreator | null, items: SampleItem[]) {
  const lines = activeItems(items);
  if (lines.length === 0) throw new Error("This request has no items left to order");
  for (const i of lines) {
    if (!/^\d+$/.test(i.shopify_variant_id)) throw new Error(`Bad Shopify variant id "${i.shopify_variant_id}" on ${i.product_title}`);
  }

  const name = (creator?.full_name ?? "").trim();
  const address = {
    first_name: name.split(/\s+/)[0] || "Creator",
    last_name: name.split(/\s+/).slice(1).join(" "),
    address1: request.shipping_address,
    city: request.shipping_city || "",
    province: request.shipping_state || "",
    zip: request.shipping_zip || "",
    country: request.shipping_country || "US",
  };

  return {
    draft_order: {
      line_items: lines.map((i) => ({ variant_id: Number(i.shopify_variant_id), quantity: 1 })),
      shipping_address: address,
      billing_address: address,
      email: creator?.email ?? undefined,
      note: [
        `Creator sample for ${name || "creator"} (request ${request.id}).`,
        ...lines.map((i) => `- ${itemLabel(i)}`),
      ].join("\n"),
      applied_discount: {
        description: "Creator Sample - 100% Off",
        value_type: "percentage",
        value: "100.0",
        title: "PROMO20",
      },
      use_customer_default_address: false,
      tags: "creator-sample,promo20",
    },
  };
}

/** Body of the approval notification: what's coming, and what was dropped and why. */
export function approvalMessage(items: SampleItem[]): string {
  const coming = activeItems(items);
  const dropped = removedItems(items);
  const parts = [
    coming.length === 1
      ? `Your request for "${itemLabel(coming[0])}" has been approved.`
      : `Your sample request has been approved. Coming in one package:\n${coming.map((i) => `- ${itemLabel(i)}`).join("\n")}`,
  ];
  if (dropped.length > 0) {
    parts.push(`Not included:\n${dropped.map((i) => `- ${itemLabel(i)}${i.removed_reason ? ` (${i.removed_reason})` : ""}`).join("\n")}`);
  }
  parts.push("Shipping details will follow shortly. Begin planning your content now so you are ready to film once it arrives.");
  return parts.join("\n\n");
}
