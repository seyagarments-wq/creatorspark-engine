import { supabase } from "@/integrations/supabase/client";

const BATCH_SIZE = 1000;

/**
 * Fetches all rows from a Supabase query by paginating in batches of 1000.
 * Use this whenever a table might exceed 1000 rows.
 *
 * @param buildQuery - A function that receives a `from` and `to` range
 *   and returns a Supabase query builder (must NOT call `.range()` itself).
 * @returns All rows concatenated.
 */
export async function batchFetchAll<T = any>(
  buildQuery: (from: number, to: number) => any
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + BATCH_SIZE - 1;
    const { data, error } = await buildQuery(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows.push(...data);

    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return allRows;
}
