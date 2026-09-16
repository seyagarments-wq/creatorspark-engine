/**
 * PayPal Payouts, lifted out of the old pay-paypal-commission function. One item per batch.
 * The request shape is the one PayPal accepted for us before; only the ids and the copy changed.
 *
 * sender_batch_id is derived from senderItemId, which callers set from the payout row id.
 * PayPal rejects a repeated sender_batch_id for 30 days, so a retry after a half-finished
 * request cannot pay the same payout twice.
 */
import { getSecret } from "./secrets.ts";
import { assertPayPalEnvAllowed, paypalBaseUrl, paypalEnv, type PayPalEnv } from "./payout-guard.ts";

export interface PayPalCredentials {
  clientId: string;
  clientSecret: string;
}

export async function getPayPalCredentials(): Promise<PayPalCredentials> {
  const clientId = await getSecret("PAYPAL_CLIENT_ID");
  const clientSecret = await getSecret("PAYPAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error(
      "PayPal API credentials are not configured. Please add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
    );
  }
  return { clientId, clientSecret };
}

export async function getPayPalAccessToken(
  clientId: string,
  clientSecret: string,
  env: PayPalEnv = paypalEnv(),
): Promise<string> {
  assertPayPalEnvAllowed(env);

  const response = await fetch(`${paypalBaseUrl(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal auth failed: ${errorText}`);
  }

  const data = await response.json();
  if (!data?.access_token) throw new Error("PayPal auth returned no access token.");
  return data.access_token as string;
}

export interface PayPalPayoutRequest {
  /** Recipient's PayPal email. */
  email: string;
  /** Dollars. Sent to PayPal as a two-decimal string in USD. */
  amount: number;
  /** Shown to the recipient on the payout item. */
  note: string;
  /** Your id for this item. Use the payout row id so a retry cannot double-pay. */
  senderItemId: string;
}

export interface PayPalPayoutOptions {
  env?: PayPalEnv;
  credentials?: PayPalCredentials;
}

/** Sends one PayPal payout and returns PayPal's payout_batch_id. */
export async function sendPayPalPayout(
  req: PayPalPayoutRequest,
  opts: PayPalPayoutOptions = {},
): Promise<string> {
  const env = opts.env ?? paypalEnv();
  assertPayPalEnvAllowed(env);

  if (!req.email) throw new Error("PayPal payout needs a recipient email.");
  if (!Number.isFinite(req.amount) || req.amount <= 0) {
    throw new Error("PayPal payout amount must be greater than zero.");
  }

  const { clientId, clientSecret } = opts.credentials ?? (await getPayPalCredentials());
  const accessToken = await getPayPalAccessToken(clientId, clientSecret, env);

  const response = await fetch(`${paypalBaseUrl(env)}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: `batch_${req.senderItemId}`,
        email_subject: "You've received a payout!",
        email_message: "Your creator payout has been sent.",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: {
            value: req.amount.toFixed(2),
            currency: "USD",
          },
          receiver: req.email,
          note: req.note,
          sender_item_id: req.senderItemId,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal payout failed: ${errorText}`);
  }

  const result = await response.json();
  const batchId = result?.batch_header?.payout_batch_id;
  if (!batchId) {
    throw new Error(
      `PayPal accepted the payout but returned no batch id. Check the PayPal dashboard before retrying. Response: ${JSON.stringify(result)}`,
    );
  }
  return batchId as string;
}
