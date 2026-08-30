/**
 * Renders sticker images from admin feedback.
 * Supports both:
 *   1. Explicit sticker URL arrays (admin_feedback_stickers column)
 *   2. Inline [sticker:url] markers embedded in text (rejection_reason)
 */

interface FeedbackStickersProps {
  /** Direct sticker URLs from admin_feedback_stickers column */
  stickerUrls?: string[] | null;
  /** Text that may contain [sticker:url] markers */
  textWithStickers?: string | null;
}

/** Extract [sticker:url] from text and return { cleanText, urls } */
export function parseStickersFromText(text: string): { cleanText: string; urls: string[] } {
  const regex = /\[sticker:(.*?)\]/g;
  const urls: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    urls.push(match[1]);
  }
  const cleanText = text.replace(/\n*\[sticker:.*?\]/g, "").trim();
  return { cleanText, urls };
}

export function FeedbackStickers({ stickerUrls, textWithStickers }: FeedbackStickersProps) {
  const allUrls: string[] = [];

  if (stickerUrls && stickerUrls.length > 0) {
    allUrls.push(...stickerUrls);
  }

  if (textWithStickers) {
    const { urls } = parseStickersFromText(textWithStickers);
    allUrls.push(...urls);
  }

  if (allUrls.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-1.5">
      {allUrls.map((url, i) => (
        <img
          key={i}
          src={url}
          alt="Feedback sticker"
          className="w-16 h-16 object-contain rounded"
          loading="lazy"
        />
      ))}
    </div>
  );
}
