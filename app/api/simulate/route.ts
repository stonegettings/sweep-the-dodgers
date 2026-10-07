import { NextResponse } from "next/server";
import { engine } from "@/lib/pools";
import type { SlotKey } from "@/lib/types";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { picks?: Partial<Record<SlotKey, string>>; team?: string };
  const out = engine.simulate(body.picks ?? {}, body.team);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json(out.result, { headers: { "Cache-Control": "no-store" } });
}
