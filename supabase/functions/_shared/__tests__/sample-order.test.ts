import { describe, it, expect } from "vitest";
import {
  SAMPLE_ORDER_MAX_ITEMS,
  addToBox,
  removeFromBox,
  boxToRpcItems,
  requestItems,
  activeItems,
  itemLabel,
  itemsSummary,
  sizeLabel,
  buildSampleDraftOrder,
  approvalMessage,
  type BoxItem,
  type SampleItem,
} from "../sample-order";

const box = (productId: string, variantId = `${productId}-M`, variantTitle = "M"): BoxItem => ({
  productId,
  productTitle: `Product ${productId}`,
  productImage: null,
  variantId,
  variantTitle,
});

const item = (position: number, over: Partial<SampleItem> = {}): SampleItem => ({
  position,
  shopify_product_id: `${100 + position}`,
  shopify_variant_id: `${9000 + position}`,
  product_title: ["Daydream Hoodie — Pink", "Wander Capri — Ash", "Daydream Hoodie — Ash"][position] ?? `Item ${position}`,
  variant_title: "M",
  product_image: null,
  removed_at: null,
  removed_reason: null,
  ...over,
});

describe("the box", () => {
  it("adds up to the limit, then refuses", () => {
    let b: BoxItem[] = [];
    for (let i = 0; i < SAMPLE_ORDER_MAX_ITEMS; i++) {
      const r = addToBox(b, box(`p${i}`));
      expect(r.outcome).toBe("added");
      b = r.box;
    }
    const full = addToBox(b, box("extra"));
    expect(full.outcome).toBe("full");
    expect(full.box).toHaveLength(SAMPLE_ORDER_MAX_ITEMS);
  });

  it("swaps the size of a product already in the box, in place", () => {
    const b = addToBox(addToBox([], box("hoodie")).box, box("capri")).box;
    const r = addToBox(b, box("hoodie", "hoodie-L", "L"));
    expect(r.outcome).toBe("swapped");
    expect(r.box.map((x) => x.variantId)).toEqual(["hoodie-L", "capri-M"]);
  });

  it("allows a size swap even when the box is full", () => {
    let b: BoxItem[] = [];
    for (let i = 0; i < SAMPLE_ORDER_MAX_ITEMS; i++) b = addToBox(b, box(`p${i}`)).box;
    expect(addToBox(b, box("p0", "p0-L", "L")).outcome).toBe("swapped");
  });

  it("re-picking the same size changes nothing", () => {
    const b = addToBox([], box("hoodie")).box;
    expect(addToBox(b, box("hoodie")).outcome).toBe("unchanged");
  });

  it("removes by product and builds the RPC payload", () => {
    const b = removeFromBox([box("a"), box("b")], "a");
    expect(boxToRpcItems(b)).toEqual([
      { product_id: "b", variant_id: "b-M", product_title: "Product b", variant_title: "M", image: null },
    ]);
  });
});

describe("requestItems", () => {
  const legacy = {
    product_name: "Daydream Hoodie — Pink",
    shopify_product_id: "101",
    shopify_variant_id: "9001",
    shopify_product_title: "Daydream Hoodie — Pink",
    shopify_variant_title: "M",
    shopify_product_image: "https://x/1.jpg",
  };

  it("uses item rows, sorted", () => {
    expect(requestItems(legacy, [item(1), item(0)]).map((i) => i.position)).toEqual([0, 1]);
  });

  it("falls back to the legacy columns for an old single-item row", () => {
    const [only, ...rest] = requestItems(legacy, []);
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ shopify_variant_id: "9001", product_title: "Daydream Hoodie — Pink", variant_title: "M" });
  });

  it("returns nothing for a legacy row with no Shopify variant", () => {
    expect(requestItems({ ...legacy, shopify_variant_id: null }, null)).toEqual([]);
  });
});

describe("labels", () => {
  it("hides Shopify's placeholder size", () => {
    expect(sizeLabel("Default Title")).toBeNull();
    expect(itemLabel({ product_title: "Tote", variant_title: "Default Title" })).toBe("Tote");
    expect(itemLabel({ product_title: "Hoodie", variant_title: "M" })).toBe("Hoodie (M)");
  });

  it("summarises like the database does", () => {
    expect(itemsSummary([item(0)])).toBe("Daydream Hoodie — Pink");
    expect(itemsSummary([item(0), item(1), item(2)])).toBe("Daydream Hoodie — Pink + 2 more");
  });
});

describe("buildSampleDraftOrder", () => {
  const request = {
    id: "req-1",
    shipping_address: "1 Main St",
    shipping_city: "Redmond",
    shipping_state: "WA",
    shipping_zip: "98052",
    shipping_country: null,
  };
  const creator = { full_name: "Leanne  Gatilogo", email: "l@example.com" };

  it("makes one order with one line per item left, dropped items excluded", () => {
    const items = [item(0), item(1, { removed_at: "2026-09-25T00:00:00Z", removed_reason: "Out of stock" }), item(2)];
    const { draft_order } = buildSampleDraftOrder(request, creator, items);
    expect(draft_order.line_items).toEqual([
      { variant_id: 9000, quantity: 1 },
      { variant_id: 9002, quantity: 1 },
    ]);
    expect(draft_order.note).toContain("request req-1");
    expect(draft_order.note).toContain("- Daydream Hoodie — Ash (M)");
    expect(draft_order.note).not.toContain("Wander Capri");
    expect(draft_order.shipping_address).toMatchObject({ first_name: "Leanne", last_name: "Gatilogo", country: "US" });
    expect(draft_order.applied_discount.value).toBe("100.0");
  });

  it("refuses an order with every item dropped", () => {
    const all = [item(0, { removed_at: "x" })];
    expect(() => buildSampleDraftOrder(request, creator, all)).toThrow(/no items left/);
  });

  it("refuses a non-numeric variant id rather than sending NaN to Shopify", () => {
    expect(() => buildSampleDraftOrder(request, creator, [item(0, { shopify_variant_id: "V1" })])).toThrow(/Bad Shopify variant/);
  });
});

describe("approvalMessage", () => {
  it("lists what's coming and what was dropped", () => {
    const msg = approvalMessage([item(0), item(1, { removed_at: "x", removed_reason: "Out of stock" }), item(2)]);
    expect(msg).toContain("Coming in one package:\n- Daydream Hoodie — Pink (M)\n- Daydream Hoodie — Ash (M)");
    expect(msg).toContain("Not included:\n- Wander Capri — Ash (M) (Out of stock)");
  });

  it("keeps the old one-line wording for a single item", () => {
    expect(approvalMessage([item(0)])).toMatch(/^Your request for "Daydream Hoodie — Pink \(M\)" has been approved\./);
    expect(activeItems([item(0)])).toHaveLength(1);
  });
});
