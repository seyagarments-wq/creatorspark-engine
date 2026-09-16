import { describe, it, expect, vi } from "vitest";

// The module reads env + creates a supabase client on import; stub both.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import { resumableEndpoint, classifyUploadError, TUS_CHUNK_SIZE } from "../resumable-upload";

function tusError(status?: number, body = ""): Error {
  const err = new Error("tus failed") as Error & { originalResponse?: unknown };
  if (status !== undefined) {
    err.originalResponse = { getStatus: () => status, getBody: () => body, getHeader: () => null };
  }
  return err;
}

describe("resumable upload plumbing", () => {
  it("targets the direct storage hostname for a hosted project", () => {
    expect(resumableEndpoint("https://abqfarkftkbkmmzozdyv.supabase.co")).toBe(
      "https://abqfarkftkbkmmzozdyv.storage.supabase.co/storage/v1/upload/resumable",
    );
  });

  it("falls back to the same origin for anything else (local, custom domain)", () => {
    expect(resumableEndpoint("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321/storage/v1/upload/resumable");
    expect(resumableEndpoint("https://api.creators.seyagarments.com/")).toBe(
      "https://api.creators.seyagarments.com/storage/v1/upload/resumable",
    );
  });

  it("uses the 6 MB chunk size Supabase requires", () => {
    expect(TUS_CHUNK_SIZE).toBe(6 * 1024 * 1024);
  });

  it("turns server responses into plain-language reasons", () => {
    expect(classifyUploadError(tusError(413)).kind).toBe("too_large");
    expect(classifyUploadError(tusError(415)).kind).toBe("unsupported_type");
    expect(classifyUploadError(tusError(400, '{"message":"mime type video/x-foo is not supported"}')).kind).toBe("unsupported_type");
    expect(classifyUploadError(tusError(401)).kind).toBe("unauthorized");
    expect(classifyUploadError(tusError(403)).kind).toBe("unauthorized");
    expect(classifyUploadError(tusError(409)).kind).toBe("conflict");
    expect(classifyUploadError(tusError(502)).kind).toBe("server");
  });

  it("treats a missing response as a lost connection and says it resumes", () => {
    const e = classifyUploadError(tusError(undefined));
    expect(e.kind).toBe("network");
    expect(e.message).toMatch(/resumes|picks up/i);
  });
});
