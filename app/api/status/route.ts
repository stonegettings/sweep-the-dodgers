import { NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import { blobEnabled, blobToken } from "@/lib/results";
import { APP_VERSION, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * A plain health check for the deployed app: which version is live, which
 * address share links use, and whether short links can be saved. Shows the
 * names of settings only, never their values.
 */
export async function GET() {
  const blobSettings = Object.keys(process.env)
    .filter((k) => k.includes("BLOB") || k.endsWith("_READ_WRITE_TOKEN") || k.endsWith("_STORE_ID"))
    .sort();

  let shortLinks: string;
  if (!blobEnabled()) {
    shortLinks = "off: no Blob store is connected to this project's Production environment (or the project wasn't redeployed after connecting)";
  } else {
    const errors: string[] = [];
    shortLinks = "";
    for (const access of ["public", "private"] as const) {
      try {
        const b = await put(`status/check-${Date.now()}.txt`, "ok", { access, token: blobToken(), addRandomSuffix: true });
        await del(b.url, { token: blobToken() }).catch(() => {});
        shortLinks = `working (${access} store)`;
        break;
      } catch (e) {
        errors.push(`${access}: ${(e as Error).message}`);
      }
    }
    if (!shortLinks) shortLinks = `failing: ${errors.join(" | ")}`;
  }

  return NextResponse.json(
    {
      version: APP_VERSION,
      shareLinksUse: siteUrl(),
      shortLinks,
      blobSignIn: blobToken() ? "read-write token" : process.env.BLOB_STORE_ID ? "token-free (store id)" : "none",
      blobSettingsFound: blobSettings,
      aiRecap: process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL ? "connected" : "off",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
