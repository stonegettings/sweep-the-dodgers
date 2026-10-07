import "server-only";
import { get, put } from "@vercel/blob";
import { decodeShare, encodeShare, type ShareData } from "./share";

// Short share links: a finished series is saved to Vercel Blob under an
// 8-character id, so links look like /r/k7Qm2xPa instead of carrying the whole
// result. Without a Blob store connected, links fall back to the long form,
// which carries the result itself.

const ID = /^[A-Za-z0-9]{8}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

// A connected store provides a read-write token, or a store id used with the deployment's OIDC identity.
// A read-write token, when the project has one, is always used first: it works on every
// setup, while the token-free (OIDC) sign-in depends on project settings.
// A store connected with a custom prefix (MY_STORE_READ_WRITE_TOKEN) is found too.
export function blobToken(): string | undefined {
  const direct = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (direct) return direct;
  const key = Object.keys(process.env).find((k) => k.endsWith("_READ_WRITE_TOKEN") && process.env[k]?.trim().startsWith("vercel_blob_rw_"));
  return key ? process.env[key]!.trim() : undefined;
}
export const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_STORE_ID?.trim() || blobToken());

// Stores are created public or private; work with either.
const ACCESS = ["public", "private"] as const;

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Saves a result and returns its short id, or null when no Blob store is connected. */
export async function saveResult(d: ShareData): Promise<string | null> {
  if (!blobEnabled()) return null;
  const id = newId();
  let lastError: unknown;
  for (const access of ACCESS) {
    try {
      await put(`results/${id}.json`, JSON.stringify(d), {
        access,
        token: blobToken(),
        addRandomSuffix: false,
        contentType: "application/json",
        cacheControlMaxAge: 60 * 60 * 24 * 365,
      });
      return id;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/** Loads a result from a short id or a long self-contained code. */
export async function loadResult(code: string): Promise<ShareData | null> {
  if (!ID.test(code)) return decodeShare(code);
  if (!blobEnabled()) return null;
  for (const access of ACCESS) {
    try {
      const r = await get(`results/${code}.json`, { access, token: blobToken() });
      if (!r) continue;
      const json = (await new Response(r.stream).json()) as ShareData;
      // re-validate through the same checks as a long link
      return decodeShare(encodeShare(json));
    } catch {
      // try the other access mode
    }
  }
  return null;
}
