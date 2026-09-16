import { describe, it, expect } from "vitest";
import {
  checkVideoFile,
  resolveVideoType,
  formatBytes,
  fileExtension,
  MAX_VIDEO_BYTES,
} from "../upload-limits";

function fakeFile(name: string, size: number, type = ""): File {
  // File with a fake size: avoid allocating the bytes.
  const f = new File([""], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("upload pre-flight", () => {
  it("accepts an iPhone .mov with the quicktime type", () => {
    const r = checkVideoFile(fakeFile("IMG_1605.MOV", 300 * 1024 * 1024, "video/quicktime"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.contentType).toBe("video/quicktime");
  });

  it("falls back to the extension when the browser gives no type (iOS picker does this)", () => {
    const r = checkVideoFile(fakeFile("clip.mov", 10 * 1024 * 1024, ""));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.contentType).toBe("video/quicktime");
    expect(resolveVideoType(fakeFile("clip.MP4", 1, ""))).toBe("video/mp4");
  });

  it("refuses a file over 1 GB and names the limit", () => {
    const r = checkVideoFile(fakeFile("big.mov", MAX_VIDEO_BYTES + 1, "video/quicktime"));
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reason).toMatch(/1 GB limit/);
      expect(r.reason).toMatch(/1\.00 GB/);
    }
  });

  it("accepts a file exactly at the limit", () => {
    const r = checkVideoFile(fakeFile("edge.mp4", MAX_VIDEO_BYTES, "video/mp4"));
    expect(r.ok).toBe(true);
  });

  it("refuses non-video types and empty files", () => {
    const img = checkVideoFile(fakeFile("photo.jpg", 500 * 1024, "image/jpeg"));
    expect(img.ok).toBe(false);
    if (img.ok === false) expect(img.reason).toMatch(/not a supported video/);

    const unknown = checkVideoFile(fakeFile("thing.xyz", 1000, ""));
    expect(unknown.ok).toBe(false);

    const empty = checkVideoFile(fakeFile("empty.mov", 0, "video/quicktime"));
    expect(empty.ok).toBe(false);
    if (empty.ok === false) expect(empty.reason).toMatch(/empty/);
  });

  it("formats sizes the way a creator reads them", () => {
    expect(formatBytes(747 * 1024 * 1024)).toBe("747 MB");
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe("1.50 GB");
    expect(formatBytes(231132)).toBe("226 KB");
    expect(fileExtension("IMG_1605_1.mov")).toBe("mov");
    expect(fileExtension("noext")).toBe("");
  });
});
