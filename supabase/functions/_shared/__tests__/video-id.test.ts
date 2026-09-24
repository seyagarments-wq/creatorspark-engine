import { describe, it, expect } from "vitest";
import { findVideoIds, resolveVideoIdFromName, videoDownloadName } from "../video-id";

describe("findVideoIds", () => {
  it.each([
    ["V916-3 | Kayla | Hook2", ["V916-3"]],
    ["Kayla - V916-3 - Pink", ["V916-3"]],
    ["[V916-3] Kayla", ["V916-3"]],
    ["Kayla_V916-3_Hook2", ["V916-3"]],
    ["V916-3_Kayla", ["V916-3"]],
    ["v916-3 Kayla", ["V916-3"]],
    ["V916-3.mov", ["V916-3"]],
    ["V916-3-A", ["V916-3"]],
    ["AS06-V916-3", ["V916-3"]],
  ])("finds the V-ID in %j", (name, expected) => {
    expect(findVideoIds(name)).toEqual(expected);
  });

  it.each([
    "KaylaV916-3",
    "V916-31 is a different video",
    "AV916-3",
    "2V916-3",
    "no id here",
    "",
  ])("does not read V916-3 out of %j", (name) => {
    expect(findVideoIds(name)).not.toContain("V916-3");
  });

  it("keeps the sequence whole", () => {
    expect(findVideoIds("V916-31_Kayla")).toEqual(["V916-31"]);
  });

  it("returns each id once, in order", () => {
    expect(findVideoIds("V916-3_V917-1 V916-3")).toEqual(["V916-3", "V917-1"]);
  });

  it("handles null", () => {
    expect(findVideoIds(null)).toEqual([]);
  });
});

describe("resolveVideoIdFromName", () => {
  const known = new Set(["V916-3", "V917-1"]);
  const isKnown = (id: string) => known.has(id);

  it("matches the one known id", () => {
    expect(resolveVideoIdFromName("Kayla_V916-3_Hook2", isKnown)).toEqual({ status: "match", id: "V916-3" });
  });

  it("ignores ids that don't exist", () => {
    expect(resolveVideoIdFromName("V999-9 vs V916-3", isKnown)).toEqual({ status: "match", id: "V916-3" });
    expect(resolveVideoIdFromName("V999-9", isKnown)).toEqual({ status: "none" });
  });

  it("refuses to pick between two known ids", () => {
    expect(resolveVideoIdFromName("V916-3 vs V917-1", isKnown)).toEqual({
      status: "ambiguous",
      ids: ["V916-3", "V917-1"],
    });
  });
});

describe("videoDownloadName", () => {
  const url = "https://x.supabase.co/storage/v1/object/public/videos/u/1790-abc.MOV";

  it("leads with the V-ID and keeps the real extension", () => {
    expect(videoDownloadName("V916-3", "Kayla Lai", url)).toBe("V916-3 - Kayla Lai.mov");
  });

  it("strips characters a filesystem rejects", () => {
    expect(videoDownloadName("V916-3", ' Kay/la: "K" ', url)).toBe("V916-3 - Kayla K.mov");
  });

  it("falls back when creator or extension is missing", () => {
    expect(videoDownloadName("V916-3", null, "https://x/videos/u/file")).toBe("V916-3.mp4");
  });

  it("round-trips: the saved name resolves back to its video", () => {
    const name = videoDownloadName("V916-3", "Kayla Lai", url);
    expect(findVideoIds(name)).toEqual(["V916-3"]);
  });
});
