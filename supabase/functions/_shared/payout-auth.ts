/**
 * Caller check for the payout functions. They run with verify_jwt = false, so this is the only
 * auth they have and it must be the first thing each function does after CORS.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { HttpError } from "./payout-guard.ts";

export type PayoutCaller = { kind: "service_role" } | { kind: "admin"; userId: string };

export interface RequireCallerOptions {
  /** Accept the project's service role key as the bearer token (server-to-server, cron). */
  allowServiceRole?: boolean;
}

/**
 * Requires `Authorization: Bearer <token>`. The token is either the service role key (only when
 * allowed) or a user JWT whose user has an admin row in user_roles. Anything else throws an
 * HttpError 401 or 403. There is no anonymous branch. `supabase` must be a service-role client.
 */
export async function requirePayoutCaller(
  req: Request,
  supabase: SupabaseClient,
  opts: RequireCallerOptions = {},
): Promise<PayoutCaller> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw new HttpError(401, "Missing Authorization header.");
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new HttpError(401, "Missing Authorization header.");

  if (opts.allowServiceRole) {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (serviceKey && token === serviceKey) return { kind: "service_role" };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    throw new HttpError(401, `Authentication error: ${userError?.message ?? "invalid token"}`);
  }

  const { data: roleData, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (roleError) throw new HttpError(500, `Role lookup failed: ${roleError.message}`);
  if (!roleData) throw new HttpError(403, "Unauthorized: Admin access required");

  return { kind: "admin", userId: userData.user.id };
}
