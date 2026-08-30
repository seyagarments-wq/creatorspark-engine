import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Resolves an integration credential.
// Order: environment variable (Supabase secret) -> platform_secrets table
// (values saved by an admin from the in-app Setup page).

const cache = new Map<string, { value: string | undefined; at: number }>();
const TTL_MS = 30_000;

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function getSecret(key: string): Promise<string | undefined> {
  const env = Deno.env.get(key);
  if (env) return env;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value: string | undefined;
  try {
    const { data } = await admin()
      .from("platform_secrets")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    value = data?.value || undefined;
  } catch (e) {
    console.error("getSecret failed for", key, e);
  }

  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function requireSecret(key: string): Promise<string> {
  const value = await getSecret(key);
  if (!value) {
    throw new Error(
      `Missing credential "${key}". An admin can add it in the app under Admin -> Setup.`,
    );
  }
  return value;
}
