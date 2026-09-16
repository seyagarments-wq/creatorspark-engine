/**
 * The two disbursement rails, Stripe Connect transfers and PayPal Payouts, behind one call.
 * Used by process-payout (one row) and process-bulk-payouts (many rows) so both behave the
 * same. Order of operations is always: move the money, then mark the row paid. A failed row
 * update is never swallowed here; callers must surface the provider id so an admin can
 * reconcile by hand.
 *
 * Nothing here touches video_earnings. When a video_pay payout flips to paid, a database
 * trigger marks its ledger rows paid.
 */
import Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getSecret } from "./secrets.ts";
import { HttpError, assertPayPalEnvAllowed, assertStripeKeyAllowed, paypalEnv } from "./payout-guard.ts";
import { getPayPalCredentials, sendPayPalPayout, type PayPalCredentials } from "./paypal.ts";

export type PayoutRail = "stripe" | "paypal";

export const PAYOUT_SELECT =
  "id, amount, status, creator_id, payout_type, stripe_transfer_id, paypal_batch_id";
export const RAIL_PROFILE_SELECT =
  "id, full_name, user_id, payout_method, paypal_email, stripe_account_id, stripe_onboarding_complete";

export interface PayoutRow {
  id: string;
  amount: number | string;
  status: string;
  creator_id: string;
  payout_type: string;
  stripe_transfer_id: string | null;
  paypal_batch_id: string | null;
}

export interface RailProfile {
  id: string;
  full_name: string | null;
  user_id: string | null;
  payout_method: string | null;
  paypal_email: string | null;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
}

export interface Disbursement {
  rail: PayoutRail;
  amount: number;
  stripe_transfer_id?: string;
  paypal_batch_id?: string;
}

/** Dollars, rounded to cents. Throws 400 on a zero or malformed amount. */
export function payoutAmount(payout: Pick<PayoutRow, "amount">): number {
  const n = typeof payout.amount === "number" ? payout.amount : parseFloat(String(payout.amount));
  if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, "Payout amount must be greater than zero.");
  return Math.round(n * 100) / 100;
}

export function railFor(profile: Pick<RailProfile, "payout_method">): PayoutRail {
  return profile.payout_method === "paypal" ? "paypal" : "stripe";
}

export function payoutTypeLabel(payoutType: string): string {
  switch (payoutType) {
    case "video_pay":
      return "Video pay";
    case "bonus":
      return "Revenue bonus";
    case "bounty":
      return "Bounty reward";
    default:
      return "Payout";
  }
}

/** 400 if the row is already paid or already carries a transfer or batch id. */
export function assertPayable(payout: PayoutRow): void {
  if (payout.status === "paid") throw new HttpError(400, "This payout has already been paid.");
  if (payout.stripe_transfer_id) {
    throw new HttpError(400, `This payout already has a Stripe transfer (${payout.stripe_transfer_id}).`);
  }
  if (payout.paypal_batch_id) {
    throw new HttpError(400, `This payout already has a PayPal batch (${payout.paypal_batch_id}).`);
  }
}

/** 400 with a plain message when the creator's chosen rail is not set up. */
export function assertRailReady(profile: RailProfile, rail: PayoutRail): void {
  if (rail === "paypal") {
    if (!profile.paypal_email) {
      throw new HttpError(400, "This creator chose PayPal but has not added a PayPal email.");
    }
    return;
  }
  if (!profile.stripe_account_id) {
    throw new HttpError(400, "This creator has not connected a Stripe account.");
  }
  if (!profile.stripe_onboarding_complete) {
    throw new HttpError(400, "This creator has not finished Stripe onboarding.");
  }
}

/** Loads the Stripe key, runs the live-key guard, returns a client. */
export async function getStripeClient(): Promise<Stripe> {
  const key = await getSecret("STRIPE_SECRET_KEY");
  if (!key) throw new HttpError(500, "STRIPE_SECRET_KEY is not set");
  assertStripeKeyAllowed(key);
  return new Stripe(key, { apiVersion: "2025-08-27.basil" });
}

export interface RailClients {
  stripe?: Stripe;
  paypal?: PayPalCredentials;
}

/**
 * Moves the money for one payout on the creator's rail and returns the provider id. Runs the
 * live guard for that rail first. Does NOT touch the database.
 */
export async function disbursePayout(
  payout: PayoutRow,
  profile: RailProfile,
  rail: PayoutRail,
  clients: RailClients = {},
): Promise<Disbursement> {
  assertRailReady(profile, rail);
  const amount = payoutAmount(payout);

  if (rail === "stripe") {
    const stripe = clients.stripe ?? (await getStripeClient());
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      destination: profile.stripe_account_id!,
      metadata: {
        payout_id: payout.id,
        payout_type: payout.payout_type,
        creator_id: profile.id,
        creator_name: profile.full_name ?? "",
      },
    });
    return { rail, amount, stripe_transfer_id: transfer.id };
  }

  const env = paypalEnv();
  assertPayPalEnvAllowed(env);
  const credentials = clients.paypal ?? (await getPayPalCredentials());
  const batchId = await sendPayPalPayout(
    {
      email: profile.paypal_email!,
      amount,
      note: `${payoutTypeLabel(payout.payout_type)} from Creators Control`,
      senderItemId: `payout_${payout.id}`,
    },
    { env, credentials },
  );
  return { rail, amount, paypal_batch_id: batchId };
}

/**
 * Marks the row paid with the provider id in its own column. Returns the PostgREST error, if
 * any; callers decide how loudly to fail. A PayPal id never goes in stripe_transfer_id.
 */
export async function markPayoutPaid(
  supabase: SupabaseClient,
  payoutId: string,
  d: Disbursement,
): Promise<{ error: { message: string } | null }> {
  const update: Record<string, unknown> = {
    status: "paid",
    paid_at: new Date().toISOString(),
  };
  if (d.rail === "stripe") update.stripe_transfer_id = d.stripe_transfer_id;
  else update.paypal_batch_id = d.paypal_batch_id;

  const { error } = await supabase.from("payouts").update(update).eq("id", payoutId);
  return { error: error ? { message: error.message } : null };
}

/** Provider id for logs and reconciliation messages. */
export function disbursementReference(d: Disbursement): string {
  return d.rail === "stripe"
    ? `Stripe transfer ${d.stripe_transfer_id}`
    : `PayPal batch ${d.paypal_batch_id}`;
}

/**
 * Tells the creator. Goes through send-notification-email so it lands in the bell, push and
 * email with their preferences applied. Best effort: a failure here never fails the payout.
 */
export async function notifyCreatorPaid(
  supabase: SupabaseClient,
  profile: RailProfile,
  payout: PayoutRow,
  d: Disbursement,
): Promise<void> {
  if (!profile.user_id) return;
  const label = payoutTypeLabel(payout.payout_type).toLowerCase();
  const where = d.rail === "paypal"
    ? `your PayPal at <strong>${profile.paypal_email}</strong>`
    : "your bank account";
  try {
    await supabase.functions.invoke("send-notification-email", {
      body: {
        user_id: profile.user_id,
        title: "Payout sent",
        message:
          `Your ${label} of <strong>$${d.amount.toFixed(2)}</strong> has been sent to ${where}.\n\n` +
          "Keep the uploads coming. Every approved video adds to your next payout.",
        notification_type: "payout",
        link: "/creator/payouts",
        button_text: "Check Your Payout",
      },
    });
  } catch (err) {
    console.error(`[PAYOUT-RAILS] creator notification failed for payout ${payout.id}:`, err);
  }
}
