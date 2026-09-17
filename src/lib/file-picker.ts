/**
 * Take the files out of a file-input change (or a drop) BEFORE resetting the input.
 *
 * `e.target.files` is the input's own live FileList. Setting `input.value = ""`
 * empties that same object in place (Chromium, WebKit), so reading it after the
 * reset yields zero files. That is why click-to-browse silently did nothing
 * while drag-and-drop (a separate DataTransfer list) worked, 2026-09-16.
 *
 * Copy first, then reset so the same file can be picked again after a remove.
 */
export function takePickedFiles(files: FileList | File[] | null | undefined, input: { value: string } | null | undefined): File[] {
  const picked = files ? Array.from(files) : [];
  if (input) input.value = "";
  return picked;
}
