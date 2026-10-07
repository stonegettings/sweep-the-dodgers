// The game's rules engine: spinning a team and running a drafted series.
// Pure functions over the data, so they run on Vercel Functions in
// production and in the browser for the in-chat test version.
import { buildYourClub, playSeries, seriesOdds, type Club, type Pitcher } from "./sim";
import { cleanTeamName, encodeShare } from "./share";
import { MAX_PICKS_PER_SPIN, SLOTS, canFill, type PublicPlayer, type Role, type SeriesResult, type SlotKey, type SpinResult } from "./types";

export type RatedPlayer = { id: string; name: string; pos: string; role: Role; positions: string[]; bbref: string; rating: number };
export type Pool = { id: string; team: string; decade: number; players: RatedPlayer[] };
export type DodgerData = {
  lineup: { name: string; pos: string; rating: number }[];
  rotation: Pitcher[];
  closer: Pitcher;
  pen: Pitcher[];
};

export type Engine = {
  dodgers: Club;
  reelTeams: string[];
  spin(openSlots: SlotKey[], taken: string[], seenPools: string[]): SpinResult | null;
  simulate(picks: Partial<Record<SlotKey, string>>, teamName?: string): { ok: true; result: SeriesResult } | { ok: false; status: number; error: string };
};

/** How many players a spin shows per role, best first (then shuffled). */
const SHOW: Record<Role, number> = { H: 7, SP: 4, RP: 3 };

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The underlying person, so Babe Ruth can't be drafted twice from two decades. */
export function personOf(id: string): string {
  return (id.split(":")[1] ?? "").replace(/-(H|SP|RP)$/, "");
}

export function createEngine(pools: Pool[], d: DodgerData): Engine {
  const index = new Map<string, RatedPlayer & { poolId: string }>();
  for (const pool of pools) for (const p of pool.players) index.set(`${pool.id}:${p.id}`, { ...p, poolId: pool.id });

  const dodgers: Club = {
    key: "LAD",
    label: "Dodgers",
    lineup: d.lineup.map((p) => ({ name: p.name, pos: p.pos, rating: p.rating })),
    rotation: d.rotation,
    closer: d.closer,
    setup: d.pen.slice(0, 2),
    mopUp: d.pen.slice(2),
  };

  function spin(openSlots: SlotKey[], taken: string[], seenPools: string[]): SpinResult | null {
    const takenPeople = new Set(taken.slice(0, 16).map(personOf));
    const seen = new Set(seenPools.slice(-40));
    for (const pool of shuffle(pools.filter((p) => !seen.has(p.id)))) {
      const shown: PublicPlayer[] = [];
      for (const role of ["H", "SP", "RP"] as Role[]) {
        const eligible = pool.players
          .filter((p) => p.role === role && !takenPeople.has(p.id.replace(/-(H|SP|RP)$/, "")) && openSlots.some((s) => canFill(p, s)))
          .slice(0, SHOW[role]);
        for (const p of eligible) shown.push({ id: `${pool.id}:${p.id}`, name: p.name, role: p.role, positions: p.positions, bbref: p.bbref });
      }
      if (shown.length >= 3) return { poolId: pool.id, team: pool.team, decade: pool.decade, players: shuffle(shown) };
    }
    return null;
  }

  function simulate(picks: Partial<Record<SlotKey, string>>, teamName?: string) {
    const name = cleanTeamName(teamName);
    const roster = SLOTS.map((slot) => {
      const id = picks[slot.key] ?? "";
      const p = index.get(id);
      return p && canFill(p, slot.key) ? { ...p, slot: slot.key, key: id } : null;
    });
    if (roster.some((p) => p === null)) return { ok: false as const, status: 400, error: "Fill all 16 spots before playing the series." };
    const full = roster as NonNullable<(typeof roster)[number]>[];
    if (new Set(full.map((p) => personOf(p.key))).size !== full.length) {
      return { ok: false as const, status: 400, error: "Each player can only be drafted once." };
    }
    const perPool = new Map<string, number>();
    for (const p of full) perPool.set(p.poolId, (perPool.get(p.poolId) ?? 0) + 1);
    if ([...perPool.values()].some((n) => n > MAX_PICKS_PER_SPIN)) {
      return { ok: false as const, status: 400, error: `You can take at most ${MAX_PICKS_PER_SPIN} players from one team.` };
    }

    const lineup = full.filter((p) => !p.slot.startsWith("SP") && !p.slot.startsWith("RP")).map((p) => ({ name: p.name, rating: p.rating, pos: p.slot }));
    const pitchers = (prefix: string) => full.filter((p) => p.slot.startsWith(prefix)).map((p) => ({ name: p.name, rating: p.rating }));
    const you = buildYourClub(lineup, pitchers("SP"), pitchers("RP"), name || undefined);

    const games = playSeries(you, dodgers);
    const youWins = games.filter((g) => g.you > g.lad).length;
    const stars = [...lineup].sort((a, b) => b.rating - a.rating).slice(0, 3).map((p) => p.name);
    const odds = seriesOdds(you, dodgers, 2000);
    const result: SeriesResult = {
      games,
      youWins,
      ladWins: games.length - youWins,
      sweep: youWins === 4 && games.length === 4,
      odds,
      share: encodeShare({
        r: full.map((p) => p.name),
        t: stars,
        g: games.map((g) => [g.you, g.lad]),
        o: [Math.round(odds.sweep * 100), Math.round(odds.series * 100)],
        ...(name ? { n: name } : {}),
      }),
    };
    return { ok: true as const, result };
  }

  return { dodgers, reelTeams: Array.from(new Set(pools.map((p) => p.team))), spin, simulate };
}
