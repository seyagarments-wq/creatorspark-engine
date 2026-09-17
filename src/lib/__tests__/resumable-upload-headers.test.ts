import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression for production 2026-09-16: `authorization` was listed in the static
// tus `headers` AND set again in `onBeforeRequest`. tus-js-client applies both via
// XMLHttpRequest.setRequestHeader, the browser joins repeated headers with ", ",
// storage received `Bearer X, Bearer X` and answered 400 "Invalid Compact JWS"
// for every upload on every device.

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "TOKEN-1" } } }) } },
}));

type HeaderReq = { setHeader: (name: string, value: string) => void };
type TusOptions = {
  headers?: Record<string, string>;
  onBeforeRequest?: (req: HeaderReq) => void | Promise<void>;
  onShouldRetry?: (err: Error, retryAttempt: number) => boolean;
  onSuccess?: () => void;
};
type Captured = { options: TusOptions };
const captured: Captured = { options: {} };

vi.mock("tus-js-client", () => {
  class Upload {
    options: TusOptions;
    constructor(_file: unknown, options: TusOptions) {
      this.options = options;
      captured.options = options;
    }
    findPreviousUploads() {
      return Promise.resolve([]);
    }
    resumeFromPreviousUpload() {}
    start() {
      // Resolve immediately so uploadResumable settles; the assertions are on the options.
      this.options.onSuccess?.();
    }
    abort() {
      return Promise.resolve();
    }
  }
  return { Upload };
});

import { uploadResumable, staticUploadHeaders, applyAuthHeader, classifyUploadError } from "../resumable-upload";

/** Mimics what tus-js-client does per request: static headers, then onBeforeRequest. */
async function simulateRequestHeaders(options: TusOptions) {
  const calls: Array<[string, string]> = [];
  const req: HeaderReq = { setHeader: (n, v) => void calls.push([n.toLowerCase(), v]) };
  for (const [name, value] of Object.entries(options.headers ?? {})) req.setHeader(name, value);
  if (typeof options.onBeforeRequest === "function") await options.onBeforeRequest(req);
  return calls;
}

function tusError(status?: number, body = ""): Error {
  const err = new Error("tus failed") as Error & { originalResponse?: unknown };
  if (status !== undefined) {
    err.originalResponse = { getStatus: () => status, getBody: () => body, getHeader: () => null };
  }
  return err;
}

describe("resumable upload request headers", () => {
  beforeEach(() => {
    captured.options = {};
  });

  it("sets the authorization header exactly once per request, from onBeforeRequest only", async () => {
    const file = new File([new Uint8Array(16)], "clip.mp4", { type: "video/mp4" });
    await uploadResumable(file, { bucket: "videos", objectName: "u/clip.mp4", contentType: "video/mp4" });

    expect(captured.options.headers).not.toHaveProperty("authorization");
    expect(captured.options.headers).not.toHaveProperty("Authorization");

    const calls = await simulateRequestHeaders(captured.options);
    const auth = calls.filter(([n]) => n === "authorization");
    expect(auth).toHaveLength(1);
    expect(auth[0][1]).toBe("Bearer TOKEN-1");
    expect(auth[0][1]).not.toContain(",");
  });

  it("keeps apikey and x-upsert as the only static headers", () => {
    expect(staticUploadHeaders(true, "ANON")).toEqual({ apikey: "ANON", "x-upsert": "true" });
    expect(staticUploadHeaders(undefined, "ANON")).toEqual({ apikey: "ANON", "x-upsert": "false" });
    expect(Object.keys(staticUploadHeaders(false, "ANON")).map((k) => k.toLowerCase())).not.toContain("authorization");
  });

  it("applyAuthHeader writes one bearer header from the current session", async () => {
    const calls: Array<[string, string]> = [];
    await applyAuthHeader({ setHeader: (n, v) => calls.push([n, v]) });
    expect(calls).toEqual([["authorization", "Bearer TOKEN-1"]]);
  });

  it("does not retry a 400: a malformed request will not heal by resending it", async () => {
    const file = new File([new Uint8Array(16)], "clip.mp4", { type: "video/mp4" });
    await uploadResumable(file, { bucket: "videos", objectName: "u/clip.mp4", contentType: "video/mp4" });
    const shouldRetry = captured.options.onShouldRetry;
    if (!shouldRetry) throw new Error("onShouldRetry not set");
    expect(shouldRetry(tusError(400, "Invalid Compact JWS"), 0)).toBe(false);
    expect(shouldRetry(tusError(500), 0)).toBe(true);
    expect(shouldRetry(tusError(undefined), 0)).toBe(true);
  });

  it("explains the malformed-token 400 in plain words instead of raw JSON", () => {
    const body = '{"statusCode":"403","code":"AccessDenied","error":"Unauthorized","message":"Invalid Compact JWS"}';
    const e = classifyUploadError(tusError(400, body));
    expect(e.kind).toBe("unauthorized");
    expect(e.message).not.toContain("{");
    expect(e.message).toMatch(/sign in/i);
  });
});
