import { NextResponse } from "next/server";
import { engine } from "@/lib/pools";
import { SLOTS, type SlotKey } from "@/lib/types";

const SLOT_KEYS = new Set<string>(SLOTS.map((s) => s.key));

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { openSlots?: string[]; taken?: string[]; seenPools?: string[] };
  const openSlots = (body.openSlots ?? []).filter((s): s is SlotKey => SLOT_KEYS.has(s));
  if (openSlots.length === 0) {
    return NextResponse.json({ error: "Your roster is already full." }, { status: 400 });
  }
  const result = engine.spin(openSlots, body.taken ?? [], body.seenPools ?? []);
  if (!result) {
    return NextResponse.json({ error: "No team has players left for your open spots. Start a new draft." }, { status: 404 });
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
