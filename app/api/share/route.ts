import { NextResponse } from "next/server";
import { decodeShare } from "@/lib/share";
import { saveResult } from "@/lib/results";

/** Turns a finished series into a short link. Responds 503 when no Blob store is connected. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const d = decodeShare(String(body.code ?? ""));
  if (!d) return NextResponse.json({ error: "That result couldn't be read." }, { status: 400 });
  try {
    const id = await saveResult(d);
    if (!id) return NextResponse.json({ error: "Short links need a Blob store." }, { status: 503 });
    return NextResponse.json({ id }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't save the result." }, { status: 502 });
  }
}
