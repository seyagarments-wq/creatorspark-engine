import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resumable (TUS) upload to Supabase Storage.
 *
 * Why not `supabase.storage.from(bucket).upload(...)`: that is one multipart
 * POST holding the whole file. On iOS Safari a phone video is hundreds of MB,
 * the tab is killed for memory partway through and the page reloads with no
 * error. TUS sends 6 MB PATCH chunks, retries each one, resumes after a
 * dropped connection, and reports real byte progress.
 *
 * Supabase constraints: chunkSize must be exactly 6 MB; metadata carries the
 * bucket/object/contentType; uploads go to the direct storage hostname.
 */

const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const TUS_CHUNK_SIZE = 6 * 1024 * 1024;

/** `https://<ref>.supabase.co` -> `https://<ref>.storage.supabase.co/storage/v1/upload/resumable` */
export function resumableEndpoint(baseUrl: string = SUPABASE_URL): string {
  try {
    const u = new URL(baseUrl);
    const m = u.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    if (m) return `https://${m[1]}.storage.supabase.co/storage/v1/upload/resumable`;
    return `${u.origin}/storage/v1/upload/resumable`;
  } catch {
    return `${baseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`;
  }
}

export type UploadFailureKind =
  | "too_large"
  | "unsupported_type"
  | "unauthorized"
  | "conflict"
  | "network"
  | "aborted"
  | "server";

export class ResumableUploadError extends Error {
  kind: UploadFailureKind;
  status?: number;
  constructor(kind: UploadFailureKind, message: string, status?: number) {
    super(message);
    this.name = "ResumableUploadError";
    this.kind = kind;
    this.status = status;
  }
}

/** Human copy per failure kind. Shown to creators, so plain language. */
export function describeUploadFailure(err: unknown): { kind: UploadFailureKind; message: string } {
  if (err instanceof ResumableUploadError) return { kind: err.kind, message: err.message };
  const msg = err instanceof Error ? err.message : String(err);
  return { kind: "server", message: msg || "The upload failed." };
}

export function classifyUploadError(err: tus.DetailedError | Error): ResumableUploadError {
  const detailed = err as tus.DetailedError;
  const res = typeof detailed.originalResponse?.getStatus === "function" ? detailed.originalResponse : null;
  const status = res ? res.getStatus() : undefined;
  const body = res ? (res.getBody?.() ?? "") : "";

  if (status === 413) {
    return new ResumableUploadError("too_large", "This video is over the size limit for uploads.", status);
  }
  if (status === 415 || (status === 400 && /mime|content.?type/i.test(body))) {
    return new ResumableUploadError("unsupported_type", "This file type is not accepted. Use MP4 or MOV.", status);
  }
  if (status === 401 || status === 403) {
    return new ResumableUploadError("unauthorized", "Your session expired. Sign in again and retry.", status);
  }
  if (status === 409) {
    return new ResumableUploadError("conflict", "Another upload of this file is already running. Wait for it or retry in a minute.", status);
  }
  if (status && status >= 500) {
    return new ResumableUploadError("server", `The storage server returned an error (${status}). Retry in a moment.`, status);
  }
  if (!status) {
    return new ResumableUploadError("network", "Connection lost. Check your signal and retry; the upload picks up where it stopped.");
  }
  return new ResumableUploadError("server", body?.slice(0, 200) || `Upload failed (${status}).`, status);
}

export interface ResumableUploadOptions {
  bucket: string;
  objectName: string;
  contentType: string;
  cacheControl?: string;
  upsert?: boolean;
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
  /** Abort handle. Aborting rejects with kind "aborted". */
  signal?: AbortSignal;
}

async function currentAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ResumableUploadError("unauthorized", "You are signed out. Sign in again and retry.");
  return token;
}

/**
 * Upload one file. Resolves with the object path (`bucket/objectName`) on
 * success. Resumes a previous attempt of the same file automatically.
 */
export async function uploadResumable(file: File, opts: ResumableUploadOptions): Promise<string> {
  const token = await currentAccessToken();

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const upload = new tus.Upload(file, {
      endpoint: resumableEndpoint(),
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: TUS_CHUNK_SIZE,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        "x-upsert": opts.upsert ? "true" : "false",
      },
      metadata: {
        bucketName: opts.bucket,
        objectName: opts.objectName,
        contentType: opts.contentType,
        cacheControl: opts.cacheControl ?? "3600",
      },
      // Re-read the session before every request so a token that refreshes
      // mid-upload (1 hour JWT, long upload) does not 401 the last chunks.
      onBeforeRequest: async (req) => {
        try {
          const fresh = await currentAccessToken();
          req.setHeader("authorization", `Bearer ${fresh}`);
        } catch {
          /* keep the original header; the server will say if it is stale */
        }
      },
      onShouldRetry: (err, retryAttempt) => {
        const status = (err as tus.DetailedError).originalResponse?.getStatus?.() ?? 0;
        // Do not hammer on errors that will not change by retrying.
        if (status === 413 || status === 415 || status === 401 || status === 403 || status === 409) return false;
        return retryAttempt < 5;
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        opts.onProgress?.(bytesUploaded, bytesTotal);
      },
      onError: (err) => {
        finish(() => reject(classifyUploadError(err)));
      },
      onSuccess: () => {
        finish(() => resolve(`${opts.bucket}/${opts.objectName}`));
      },
    });

    if (opts.signal) {
      if (opts.signal.aborted) {
        finish(() => reject(new ResumableUploadError("aborted", "Upload cancelled.")));
        return;
      }
      opts.signal.addEventListener(
        "abort",
        () => {
          upload.abort(true).catch(() => {});
          finish(() => reject(new ResumableUploadError("aborted", "Upload cancelled.")));
        },
        { once: true },
      );
    }

    upload
      .findPreviousUploads()
      .then((previous) => {
        if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(() => upload.start());
  });
}
