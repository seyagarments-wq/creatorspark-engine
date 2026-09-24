/**
 * V-ID matching, shared by the Meta performance sync (which decides whose video an ad's
 * revenue is credited to) and the app UI. One implementation so they can't drift.
 *
 * A V-ID is `V{month}{day}-{sequence}`, e.g. V916-3. In an ad or file name it may sit next
 * to any separator, including `_`: `Kayla_V916-3_Hook2`, `V916-3 - Kayla`, `[v916-3]`.
 * It may not be glued to a letter or digit on the left (`KaylaV916-3`), and the sequence
 * may not run on into more digits (`V916-31` is not `V916-3`).
 *
 * No lookbehind: this module is bundled into creator pages, and lookbehind is a parse
 * error on iOS Safari before 16.4.
 */

const VIDEO_ID_IN_TEXT = /(?:^|[^A-Za-z0-9])([Vv]\d+-\d+)(?!\d)/g;

/** Every distinct V-ID in the text, uppercased, in order of appearance. */
export function findVideoIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  for (const m of text.matchAll(new RegExp(VIDEO_ID_IN_TEXT.source, "g"))) {
    seen.add(m[1].toUpperCase());
  }
  return [...seen];
}

export type VideoIdResolution =
  | { status: "match"; id: string }
  | { status: "none" }
  | { status: "ambiguous"; ids: string[] };

/**
 * Which known video an ad name refers to. Only V-IDs that exist (`isKnown`) count.
 * Two or more different known V-IDs in one name is `ambiguous`: nobody is credited,
 * rather than guessing and paying the wrong creator.
 */
export function resolveVideoIdFromName(
  name: string | null | undefined,
  isKnown: (id: string) => boolean,
): VideoIdResolution {
  const ids = findVideoIds(name).filter(isKnown);
  if (ids.length === 0) return { status: "none" };
  if (ids.length > 1) return { status: "ambiguous", ids };
  return { status: "match", id: ids[0] };
}

/**
 * Filename a downloaded video is saved under: `V916-3 - Kayla Lai.mov`. The V-ID leads and
 * is set off by spaces so it survives into whatever the ad ends up being named.
 */
export function videoDownloadName(
  uniqueVideoId: string,
  creatorName: string | null | undefined,
  videoUrl: string | null | undefined,
): string {
  const ext = /\.([A-Za-z0-9]{2,5})(?:[?#]|$)/.exec(videoUrl ?? "")?.[1]?.toLowerCase() ?? "mp4";
  const creator = (creatorName ?? "").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
  return creator ? `${uniqueVideoId} - ${creator}.${ext}` : `${uniqueVideoId}.${ext}`;
}
