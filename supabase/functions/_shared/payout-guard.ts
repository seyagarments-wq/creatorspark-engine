/**
 * Money guard for the payout rails.
 *
 * Staging only ever has a Stripe TEST key and PayPal SANDBOX credentials. Production sets the
 * edge secret PAYOUTS_LIVE to exactly "true". Anything that would move real money (a Stripe
 * key starting with sk_live_, or the live PayPal endpoint) is refused unless that secret is set.
 *
 * Everything here reads Deno.env on purpose, not platform_secrets: the in-app Setup page must
 * not be able to flip this switch.
 */

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export const LIVE_PAYOUTS_DISABLED_MESSAGE = "Live payouts are disabled on this project.";

export class LivePayoutsDisabledError extends HttpError {
  constructor() {
    super(403, LIVE_PAYOUTS_DISABLED_MESSAGE);
    this.name = "LivePayoutsDisabledError";
  }
}

export function payoutsLiveEnabled(): boolean {
  return Deno.env.get("PAYOUTS_LIVE") === "true";
}

export function isLiveStripeKey(key: string): boolean {
  return key.startsWith("sk_live_");
}

/** Refuse a live Stripe key unless PAYOUTS_LIVE is "true". Call before creating a transfer. */
export function assertStripeKeyAllowed(key: string): void {
  if (isLiveStripeKey(key) && !payoutsLiveEnabled()) throw new LivePayoutsDisabledError();
}

export type PayPalEnv = "live" | "sandbox";

/** PAYPAL_ENV secret: "live" or "sandbox". Anything else, including unset, is sandbox. */
export function paypalEnv(): PayPalEnv {
  const raw = (Deno.env.get("PAYPAL_ENV") ?? "sandbox").trim().toLowerCase();
  return raw === "live" ? "live" : "sandbox";
}

export function paypalBaseUrl(env: PayPalEnv = paypalEnv()): string {
  return env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

/** Refuse the live PayPal endpoint unless PAYOUTS_LIVE is "true". Call before any PayPal request. */
export function assertPayPalEnvAllowed(env: PayPalEnv = paypalEnv()): void {
  if (env === "live" && !payoutsLiveEnabled()) throw new LivePayoutsDisabledError();
}
