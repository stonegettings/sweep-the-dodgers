// Shared types and roster rules. Nothing here carries ratings: the browser never sees them.
import type { GameDetail } from "./sim";

export type Role = "H" | "SP" | "RP";

export const FIELD_POSITIONS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;

export type SlotKey = (typeof FIELD_POSITIONS)[number] | "DH" | "SP1" | "SP2" | "SP3" | "SP4" | "RP1" | "RP2" | "RP3";

export type Slot = { key: SlotKey; group: "lineup" | "rotation" | "bullpen"; label: string };

export const SLOTS: Slot[] = [
  ...FIELD_POSITIONS.map((p) => ({ key: p, group: "lineup" as const, label: p })),
  { key: "DH", group: "lineup", label: "DH" },
  { key: "SP1", group: "rotation", label: "SP1" },
  { key: "SP2", group: "rotation", label: "SP2" },
  { key: "SP3", group: "rotation", label: "SP3" },
  { key: "SP4", group: "rotation", label: "SP4" },
  { key: "RP1", group: "bullpen", label: "RP" },
  { key: "RP2", group: "bullpen", label: "RP" },
  { key: "RP3", group: "bullpen", label: "RP" },
];

export const MAX_PICKS_PER_SPIN = 3;
export const SKIPS_PER_DRAFT = 2;

/** A player as the browser sees him: name, positions, photo id. No stats. */
export type PublicPlayer = {
  id: string; // "<poolId>:<playerID>-<role>"
  name: string;
  role: Role;
  positions: string[]; // field positions played 20+ games in his career; empty = DH only
  bbref: string;
};

/**
 * Who can fill which spot: hitters at any position they played (and DH),
 * starters in the rotation or the bullpen, relievers in the bullpen.
 */
export function canFill(p: { role: Role; positions: string[] }, slot: SlotKey): boolean {
  if (p.role === "H") return slot === "DH" || p.positions.includes(slot);
  if (p.role === "SP") return slot.startsWith("SP") || slot.startsWith("RP");
  return slot.startsWith("RP");
}

export function positionText(p: PublicPlayer): string {
  if (p.role === "SP") return "Starting pitcher";
  if (p.role === "RP") return "Relief pitcher";
  return p.positions.length ? p.positions.join(" / ") : "Designated hitter";
}

export type SpinResult = {
  poolId: string;
  team: string;
  decade: number;
  players: PublicPlayer[];
};

export type SeriesResult = {
  games: GameDetail[];
  youWins: number;
  ladWins: number;
  sweep: boolean;
  odds: { sweep: number; series: number };
  share: string;
};

export type { GameDetail };
