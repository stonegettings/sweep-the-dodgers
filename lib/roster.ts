// Roster moves: where a drafted player can go, sliding a flexible player over
// to make room, and moving or swapping players already on the roster.
import { SLOTS, canFill, type Role, type Slot, type SlotKey } from "./types";

type Member = { name: string; role: Role; positions: string[] };
export type Roster<T extends Member = Member> = Partial<Record<SlotKey, T>>;

/** Placing a player in `slot`, optionally sliding its current occupant to `bump.to`. */
export type Placement = { slot: SlotKey; label: string; bump?: { name: string; to: SlotKey; toLabel: string } };

/** Move a player to `to`; if someone is there, the two swap. */
export type MoveOption = { to: SlotKey; label: string; swapWith?: string };

const BY_KEY = new Map(SLOTS.map((s) => [s.key, s] as const));
const lastName = (n: string) => n.split(" ").slice(-1)[0];
const groupWord = (s: Slot) => (s.group === "rotation" ? "the rotation" : s.group === "bullpen" ? "the bullpen" : s.key);

/** An open spot the occupant of `from` could slide to, real positions before DH. */
function slideTarget<T extends Member>(roster: Roster<T>, from: SlotKey): SlotKey | null {
  const q = roster[from];
  if (!q) return null;
  const open = SLOTS.filter((s) => s.key !== from && !roster[s.key] && canFill(q, s.key));
  const field = open.find((s) => s.group === "lineup" && s.key !== "DH");
  return (field ?? open[0])?.key ?? null;
}

/** Every way to add player `p`: open spots first, then spots freed by sliding someone over. */
export function placementsFor<T extends Member>(p: Member, roster: Roster<T>): Placement[] {
  const out: Placement[] = [];
  const consider = (slots: Slot[], label: (s: Slot) => string) => {
    const fits = slots.filter((s) => canFill(p, s.key));
    const open = fits.find((s) => !roster[s.key]);
    if (open) return out.push({ slot: open.key, label: label(open) });
    for (const s of fits) {
      const to = slideTarget(roster, s.key);
      if (to) {
        const toSlot = BY_KEY.get(to)!;
        return out.push({ slot: s.key, label: label(s), bump: { name: lastName(roster[s.key]!.name), to, toLabel: groupWord(toSlot) } });
      }
    }
  };
  if (p.role === "H") {
    for (const s of SLOTS.filter((x) => x.group === "lineup")) consider([s], (x) => x.key);
  } else {
    consider(SLOTS.filter((s) => s.group === "rotation"), () => "Rotation");
    consider(SLOTS.filter((s) => s.group === "bullpen"), () => "Bullpen");
  }
  return out;
}

/** Spots a new player could end up in: open ones, plus ones whose occupant can slide over. */
export function reachableSlots<T extends Member>(roster: Roster<T>): SlotKey[] {
  return SLOTS.filter((s) => !roster[s.key] || slideTarget(roster, s.key) !== null).map((s) => s.key);
}

/** Add `p` according to a placement, sliding the occupant first when needed. */
export function place<T extends Member>(roster: Roster<T>, p: T, pl: Placement): Roster<T> {
  const next = { ...roster };
  if (pl.bump) {
    next[pl.bump.to] = next[pl.slot];
  }
  next[pl.slot] = p;
  return next;
}

/** Where the player in `from` can go: open spots he can play, or swaps where both can play the other's spot. */
export function moveOptions<T extends Member>(roster: Roster<T>, from: SlotKey): MoveOption[] {
  const p = roster[from];
  if (!p) return [];
  const fromGroup = BY_KEY.get(from)!.group;
  const out: MoveOption[] = [];
  const openGroupShown = new Set<string>();
  for (const s of SLOTS) {
    if (s.key === from || !canFill(p, s.key)) continue;
    const q = roster[s.key];
    const pitching = s.group !== "lineup";
    const name = pitching ? (s.group === fromGroup ? s.label : s.group === "rotation" ? "Rotation" : "Bullpen") : s.label;
    if (s.group === "bullpen" && fromGroup === "bullpen") continue; // bullpen order doesn't matter
    if (!q) {
      // one button per pitching group for open spots (any open bullpen spot is the same)
      if (pitching && openGroupShown.has(s.group)) continue;
      if (pitching) openGroupShown.add(s.group);
      out.push({ to: s.key, label: pitching && s.group !== fromGroup ? name : s.group === "bullpen" ? "Bullpen" : s.label });
    } else if (canFill(q, from)) {
      out.push({ to: s.key, label: name, swapWith: lastName(q.name) });
    }
  }
  return out;
}

export function move<T extends Member>(roster: Roster<T>, from: SlotKey, to: SlotKey): Roster<T> {
  const next = { ...roster };
  const a = next[from];
  const b = next[to];
  next[to] = a;
  if (b) next[from] = b;
  else delete next[from];
  return next;
}
