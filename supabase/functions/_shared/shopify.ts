/**
 * Shopify Admin API access for the sample functions.
 *
 * Credentials come from getSecret(): SHOPIFY_STORE_DOMAIN, plus either an Admin API access
 * token (SHOPIFY_ACCESS_TOKEN) or a client id + secret that mint one through the
 * client_credentials grant. Minted tokens expire (24 h), so a minted token pasted into the Setup
 * page as SHOPIFY_ACCESS_TOKEN stops working a day later and every call 401s. That happened on
 * production around 2026-09-24. So: try the saved token, and on a 401 mint a fresh one from the
 * client credentials and retry once.
 */
import { getSecret } from "./secrets.ts";

export const SHOPIFY_API_VERSION = "2024-01";

let minted: { token: string; expiresAt: number } | null = null;

async function mintToken(domain: string): Promise<string | null> {
  if (minted && Date.now() < minted.expiresAt) return minted.token;
  const clientId = await getSecret("SHOPIFY_CLIENT_ID");
  const clientSecret = await getSecret("SHOPIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Shopify refused the client credentials: ${res.status} - ${await res.text()}`);
  const data = await res.json();
  const ttlMs = typeof data.expires_in === "number" ? data.expires_in * 1000 : 23 * 3600 * 1000;
  minted = { token: data.access_token, expiresAt: Date.now() + ttlMs - 5 * 60 * 1000 };
  return minted.token;
}

/** fetch() against `https://<store>/admin/api/<version>/<path>` with a working token. */
export async function shopifyFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const domain = await getSecret("SHOPIFY_STORE_DOMAIN");
  if (!domain) throw new Error("SHOPIFY_STORE_DOMAIN not configured");
  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/${path.replace(/^\//, "")}`;
  const call = (token: string) =>
    fetch(url, { ...init, headers: { ...(init.headers ?? {}), "X-Shopify-Access-Token": token, "Content-Type": "application/json" } });

  const saved = await getSecret("SHOPIFY_ACCESS_TOKEN");
  let token = saved || (await mintToken(domain));
  if (!token) throw new Error("Missing Shopify credentials. Add them at /admin/setup.");

  let res = await call(token);
  if (res.status === 401 && saved) {
    const fresh = await mintToken(domain);
    if (fresh) {
      console.warn("Saved SHOPIFY_ACCESS_TOKEN was rejected (401); retrying with a token minted from the client credentials.");
      token = fresh;
      res = await call(token);
    }
  }
  if (res.status === 401) {
    throw new Error("Shopify rejected the credentials (401). Update the Shopify token or client credentials at /admin/setup.");
  }
  return res;
}
