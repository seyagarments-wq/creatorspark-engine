/**
 * supabase.functions.invoke() hides the function's own error message: when the function
 * answers with a non-2xx status, `error` is a FunctionsHttpError whose `context` is the raw
 * Response, and `error.message` is just "Edge Function returned a non-2xx status code".
 * The payout functions always answer `{ error: "<plain sentence>" }`, so read that and show it.
 */
export async function functionErrorMessage(error: unknown, fallback = "Something went wrong."): Promise<string> {
  if (!error) return fallback;
  const ctx = (error as { context?: unknown }).context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      const msg = body?.error ?? body?.message;
      if (typeof msg === "string" && msg.trim()) return msg;
    } catch {
      try {
        const text = await ctx.clone().text();
        if (text.trim()) return text.slice(0, 300);
      } catch {
        /* fall through */
      }
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
