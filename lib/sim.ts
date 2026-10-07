// The series simulation, played one plate appearance at a time.
// Pure functions with no I/O, so it can be tested on its own.
//
// Each plate appearance draws an outcome (walk, strikeout, single, double,
// triple, home run, or an out in play). The odds start from modern league
// averages and shift with the hitter's OPS+ and the pitcher's ERA+.
// Runners advance with simple, realistic rules. Starters go about six
// innings, then setup men and the closer take over. Every game produces a
// line score, a box score, decisions and highlights.

export type Batter = { name: string; rating: number; pos: string };
export type Pitcher = { name: string; rating: number };

export type Club = {
  key: "YOU" | "LAD";
  label: string;
  lineup: Batter[]; // batting order
  rotation: Pitcher[];
  closer: Pitcher;
  setup: Pitcher[];
  mopUp: Pitcher[];
};

export type BatLine = { name: string; pos: string; ab: number; r: number; h: number; hr: number; rbi: number; bb: number; k: number };
export type PitchLine = { name: string; ip: string; h: number; r: number; bb: number; k: number; hr: number };

export type GameDetail = {
  game: number;
  you: number;
  lad: number;
  home: "YOU" | "LAD";
  innings: number;
  extras: boolean;
  starters: { you: string; lad: string };
  note: string;
  highlights: string[];
  line: { you: (number | null)[]; lad: (number | null)[] };
  hits: { you: number; lad: number };
  errors: { you: number; lad: number };
  decisions: { w: string; l: string; s?: string };
  box: { you: BatLine[]; lad: BatLine[] };
  pitching: { you: PitchLine[]; lad: PitchLine[] };
};

// ---------- tuning ----------

/**
 * Drafted players are rated on their single best season, which flatters them,
 * so each keeps only 45% of his gap from league average. Tuned so a sweep stays
 * rare: about 4-5% for a strong draft and about 2% for a careless one.
 */
export const BEST_SEASON_KEEP = 0.45;

/** League-average outcome rates per plate appearance. */
const BASE = { BB: 0.088, K: 0.218, S: 0.147, D: 0.046, T: 0.004, HR: 0.031 };
/** How strongly each outcome responds to hitter quality relative to pitcher quality. */
const ELASTIC = { BB: 0.42, K: -0.36, S: 0.25, D: 0.5, T: 0.45, HR: 0.78 };
const ERROR_RATE = 0.015;
const DODGER_HOME_GAMES = new Set([1, 2, 6, 7]);

export function regressPlayer<T extends { rating: number }>(p: T): T {
  return { ...p, rating: 100 + BEST_SEASON_KEEP * (p.rating - 100) };
}

// ---------- plate appearance ----------

type Outcome = "BB" | "K" | "S" | "D" | "T" | "HR" | "OUT";

function drawOutcome(batter: number, pitcher: number, rand: () => number): Outcome {
  const s = (batter / 100) * (100 / pitcher);
  const bb = BASE.BB * Math.pow(s, ELASTIC.BB);
  const k = BASE.K * Math.pow(s, ELASTIC.K);
  const si = BASE.S * Math.pow(s, ELASTIC.S);
  const d = BASE.D * Math.pow(s, ELASTIC.D);
  const t = BASE.T * Math.pow(s, ELASTIC.T);
  const hr = BASE.HR * Math.pow(s, ELASTIC.HR);
  let r = rand();
  if ((r -= bb) < 0) return "BB";
  if ((r -= k) < 0) return "K";
  if ((r -= si) < 0) return "S";
  if ((r -= d) < 0) return "D";
  if ((r -= t) < 0) return "T";
  if ((r -= hr) < 0) return "HR";
  return "OUT";
}

// ---------- game state ----------

type PStat = { p: Pitcher; outs: number; h: number; r: number; bb: number; k: number; hr: number; starter: boolean };
type BStat = { ab: number; r: number; h: number; hr: number; rbi: number; bb: number; k: number };

type Side = {
  club: Club;
  starter: Pitcher;
  next: number; // batting order position
  runs: number;
  hits: number;
  errors: number; // committed in the field
  line: (number | null)[];
  bat: BStat[];
  staff: PStat[];
  cur: PStat;
  inningsLeft: number; // for the current reliever
  used: Set<string>;
};

type Event = {
  inning: number;
  side: "YOU" | "LAD";
  batter: string;
  pitcher: string;
  kind: Outcome | "SF" | "E";
  runs: number;
  you: number;
  lad: number;
};

function newSide(club: Club, starter: Pitcher): Side {
  const cur: PStat = { p: starter, outs: 0, h: 0, r: 0, bb: 0, k: 0, hr: 0, starter: true };
  return {
    club,
    starter,
    next: 0,
    runs: 0,
    hits: 0,
    errors: 0,
    line: [],
    bat: club.lineup.map(() => ({ ab: 0, r: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0 })),
    staff: [cur],
    cur,
    inningsLeft: 99,
    used: new Set([starter.name]),
  };
}

function bringIn(side: Side, p: Pitcher, innings: number) {
  const stat: PStat = { p, outs: 0, h: 0, r: 0, bb: 0, k: 0, hr: 0, starter: false };
  side.staff.push(stat);
  side.cur = stat;
  side.used.add(p.name);
  side.inningsLeft = innings;
}

/** Picks the next reliever for the fielding side. `lead` is the fielding team's lead. */
function relieve(side: Side, inning: number, lead: number) {
  const c = side.club;
  const fresh = (p: Pitcher) => !side.used.has(p.name);
  const saveSpot = inning >= 9 && lead >= 0 && lead <= 3;
  if (saveSpot && fresh(c.closer)) return bringIn(side, c.closer, 1);
  const setup = c.setup.find(fresh);
  if (setup) return bringIn(side, setup, inning < 7 ? 2 : 1);
  const mop = c.mopUp.find(fresh);
  if (mop) return bringIn(side, mop, 3);
  if (fresh(c.closer)) return bringIn(side, c.closer, 1);
  side.inningsLeft = 99; // nobody left: the last man keeps pitching
}

function starterDone(side: Side, inning: number): boolean {
  const s = side.cur;
  if (!s.starter) return false;
  if (s.r >= 5) return true;
  if (inning >= 8) return true;
  if (inning === 7) return s.r > 1 || s.p.rating < 130;
  return false;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function ip(outs: number): string {
  return `${Math.floor(outs / 3)}${outs % 3 ? `.${outs % 3}` : ""}`;
}

// ---------- one game ----------

export function playGame(
  gameNo: number,
  you: Club,
  lad: Club,
  starters: { you: Pitcher; lad: Pitcher },
  rand: () => number,
  detail: boolean,
): GameDetail {
  const ladHome = DODGER_HOME_GAMES.has(gameNo);
  const Y = newSide(you, starters.you);
  const L = newSide(lad, starters.lad);
  const away = ladHome ? Y : L;
  const home = ladHome ? L : Y;
  const events: Event[] = [];
  // go-ahead tracking for decisions
  let leader: "YOU" | "LAD" | null = null;
  let lastGoAhead: { team: "YOU" | "LAD"; w: PStat; l: PStat; ev: number } | null = null;

  const score = () => ({ you: Y.runs, lad: L.runs });

  function half(bat: Side, fld: Side, inning: number, bottom: boolean) {
    const lead = fld.runs - bat.runs;
    if (fld.cur.starter ? starterDone(fld, inning) : fld.inningsLeft <= 0) relieve(fld, inning, lead);
    let outs = 0;
    let runsHere = 0;
    const bases: (number | null)[] = [null, null, null];

    const score1 = (idx: number | null) => {
      if (idx === null) return 0;
      bat.bat[idx].r++;
      bat.runs++;
      runsHere++;
      fld.cur.r++;
      return 1;
    };

    while (outs < 3) {
      if (bottom && inning >= 9 && home.runs > away.runs) break;
      const bi = bat.next;
      bat.next = (bat.next + 1) % 9;
      const b = bat.club.lineup[bi];
      const line = bat.bat[bi];
      const pitcher = fld.cur;
      const before = bat.runs;
      let kind: Event["kind"] = drawOutcome(b.rating, pitcher.p.rating, rand);
      let rbi = 0;

      if (kind === "BB") {
        line.bb++;
        pitcher.bb++;
        if (bases[0] !== null) {
          if (bases[1] !== null) {
            if (bases[2] !== null) rbi += score1(bases[2]);
            bases[2] = bases[1];
          }
          bases[1] = bases[0];
        }
        bases[0] = bi;
      } else if (kind === "K") {
        line.ab++;
        line.k++;
        pitcher.k++;
        pitcher.outs++;
        outs++;
      } else if (kind === "OUT") {
        if (rand() < ERROR_RATE) {
          kind = "E";
          line.ab++;
          fld.errors++;
          score1(bases[2]); // unearned, no RBI
          bases[2] = bases[1];
          bases[1] = bases[0];
          bases[0] = bi;
        } else {
          line.ab++;
          outs++;
          pitcher.outs++;
          if (outs < 3 && bases[0] !== null && rand() < 0.12) {
            // double play
            bases[0] = null;
            outs++;
            pitcher.outs++;
          } else if (outs < 3) {
            if (bases[2] !== null && rand() < 0.4) {
              line.ab--; // sacrifice fly
              kind = "SF";
              rbi += score1(bases[2]);
              bases[2] = null;
            }
            if (bases[1] !== null && bases[2] === null && rand() < 0.3) {
              bases[2] = bases[1];
              bases[1] = null;
            }
          }
        }
      } else {
        // hits
        line.ab++;
        line.h++;
        pitcher.h++;
        bat.hits++;
        if (kind === "S") {
          rbi += score1(bases[2]);
          bases[2] = null;
          if (bases[1] !== null) {
            if (rand() < 0.6) rbi += score1(bases[1]);
            else bases[2] = bases[1];
            bases[1] = null;
          }
          if (bases[0] !== null) {
            if (bases[2] === null && rand() < 0.3) bases[2] = bases[0];
            else bases[1] = bases[0];
          }
          bases[0] = bi;
        } else if (kind === "D") {
          rbi += score1(bases[2]) + score1(bases[1]);
          bases[2] = null;
          bases[1] = null;
          if (bases[0] !== null) {
            if (rand() < 0.45) rbi += score1(bases[0]);
            else bases[2] = bases[0];
          }
          bases[0] = null;
          bases[1] = bi;
        } else if (kind === "T") {
          rbi += score1(bases[2]) + score1(bases[1]) + score1(bases[0]);
          bases[0] = bases[1] = null;
          bases[2] = bi;
        } else {
          line.hr++;
          pitcher.hr++;
          rbi += score1(bases[2]) + score1(bases[1]) + score1(bases[0]) + score1(bi);
          bases[0] = bases[1] = bases[2] = null;
        }
      }
      line.rbi += rbi;

      const runs = bat.runs - before;
      if (runs > 0 || kind === "HR") {
        if (detail) events.push({ inning, side: bat.club.key, batter: b.name, pitcher: pitcher.p.name, kind, runs, ...score() });
        const nowLeader = Y.runs > L.runs ? "YOU" : L.runs > Y.runs ? "LAD" : null;
        if (nowLeader && nowLeader !== leader) {
          lastGoAhead = { team: nowLeader, w: bat.cur, l: fld.cur, ev: events.length - 1 };
        }
        leader = nowLeader;
      }

      // pull a starter who's getting hit hard
      if (outs < 3 && fld.cur.starter && fld.cur.r >= 5) relieve(fld, inning, fld.runs - bat.runs);
    }
    bat.line.push(runsHere);
    fld.inningsLeft--;
  }

  let inning = 1;
  for (; ; inning++) {
    half(away, home, inning, false);
    if (inning >= 9 && home.runs > away.runs) {
      home.line.push(null); // bottom half not needed
      break;
    }
    half(home, away, inning, true);
    if (inning >= 9 && home.runs !== away.runs) break;
    if (inning >= 18) {
      // marathon safety valve: a run scores on a wild pitch
      home.runs++;
      home.line[home.line.length - 1] = (home.line[home.line.length - 1] ?? 0) + 1;
      break;
    }
  }

  const winner = Y.runs > L.runs ? Y : L;
  const loser = winner === Y ? L : Y;
  const ga = lastGoAhead as { team: "YOU" | "LAD"; w: PStat; l: PStat; ev: number } | null;
  let wStat = ga?.w ?? winner.staff[0];
  const lStat = ga?.l ?? loser.staff[0];
  if (wStat.starter && wStat.outs < 15 && winner.staff.length > 1) wStat = winner.staff[1];
  const finisher = winner.staff[winner.staff.length - 1];
  const margin = winner.runs - loser.runs;
  const save = finisher !== wStat && margin <= 3 && finisher.outs >= 3 ? finisher : null;

  const result: GameDetail = {
    game: gameNo,
    you: Y.runs,
    lad: L.runs,
    home: ladHome ? "LAD" : "YOU",
    innings: inning,
    extras: inning > 9,
    starters: { you: starters.you.name, lad: starters.lad.name },
    note: "",
    highlights: [],
    line: { you: Y.line, lad: L.line },
    hits: { you: Y.hits, lad: L.hits },
    errors: { you: Y.errors, lad: L.errors },
    decisions: { w: wStat.p.name, l: lStat.p.name, ...(save ? { s: save.p.name } : {}) },
    box: { you: [], lad: [] },
    pitching: { you: [], lad: [] },
  };
  if (!detail) return result;

  for (const side of [Y, L]) {
    const k = side === Y ? "you" : "lad";
    result.box[k] = side.club.lineup.map((b, i) => ({ name: b.name, pos: b.pos, ...side.bat[i] }));
    result.pitching[k] = side.staff.map((s) => ({ name: s.p.name, ip: ip(s.outs), h: s.h, r: s.r, bb: s.bb, k: s.k, hr: s.hr }));
  }
  const story = writeStory(events, ga?.ev ?? -1, Y, L, winner, save, inning, ladHome);
  result.highlights = story.highlights;
  result.note = story.note;
  return result;
}

// ---------- highlights ----------

export const DEFAULT_TEAM = "Your team";

/** How the story refers to the player's club: its name, or "your team". */
function youName(label: string) {
  return label === DEFAULT_TEAM ? "your team" : label;
}

function scoreText(you: number, lad: number, label: string) {
  if (you === lad) return `tied ${you}-${lad}`;
  return you > lad ? `${you}-${lad} ${label === DEFAULT_TEAM ? "you" : label}` : `${lad}-${you} Dodgers`;
}

const HR_WORD = ["", "solo homer", "two-run homer", "three-run homer", "grand slam"];
const HIT_WORD: Record<string, string> = { S: "single", D: "double", T: "triple", BB: "bases-loaded walk", SF: "sacrifice fly", E: "error", OUT: "groundout" };

function writeStory(events: Event[], winningEv: number, Y: Side, L: Side, winner: Side, save: PStat | null, innings: number, ladHome: boolean) {
  const items: { at: number; text: string; weight: number }[] = [];
  const label = Y.club.label;
  const teamName = (k: "YOU" | "LAD") => (k === "YOU" ? youName(label) : "the Dodgers");
  const last = events[events.length - 1];
  const walkoff = last && last.inning >= 9 && ((ladHome && last.side === "LAD") || (!ladHome && last.side === "YOU")) && last === events[winningEv];

  events.forEach((e, i) => {
    const when = `${ordinal(e.inning)} inning`;
    if (i === winningEv && walkoff) {
      const what = e.kind === "HR" ? `a walk-off ${HR_WORD[e.runs] ?? "homer"}` : `a walk-off ${HIT_WORD[e.kind] ?? "hit"}`;
      items.push({ at: e.inning * 2 + 1, text: `${e.batter} ended it with ${what} off ${e.pitcher} in the ${when}.`, weight: 100 });
    } else if (e.kind === "HR") {
      const tag = i === winningEv ? " It held up as the winning run." : "";
      items.push({ at: e.inning * 2, text: `${e.batter} hit a ${HR_WORD[e.runs] ?? "homer"} off ${e.pitcher} in the ${when}, ${scoreText(e.you, e.lad, label)}.${tag}`, weight: (i === winningEv ? 60 : 20) + e.runs * 5 });
    } else if (i === winningEv) {
      const verb = e.kind === "SF" ? "lifted a go-ahead sacrifice fly" : `came through with the go-ahead ${HIT_WORD[e.kind] ?? "hit"}`;
      items.push({ at: e.inning * 2, text: `${e.batter} ${verb} in the ${when}, and ${teamName(e.side)} never trailed again.`, weight: 55 });
    } else if (e.runs >= 3) {
      items.push({ at: e.inning * 2, text: `${e.batter}'s ${HIT_WORD[e.kind] ?? "hit"} brought home ${e.runs} in the ${when}.`, weight: 15 });
    }
  });

  for (const side of [Y, L]) {
    const sp = side.staff[0];
    if (sp.k >= 8 || (sp.outs >= 18 && sp.r <= 1)) {
      items.push({ at: 50, text: `${sp.p.name} went ${ip(sp.outs)} innings, allowed ${sp.r} run${sp.r === 1 ? "" : "s"} and struck out ${sp.k}.`, weight: 30 + sp.k * 2 - sp.r * 5 });
    }
    side.club.lineup.forEach((b, i) => {
      const s = side.bat[i];
      if (s.h >= 3) items.push({ at: 51, text: `${b.name} went ${s.h}-for-${s.ab}${s.rbi ? ` with ${s.rbi} RBI` : ""}.`, weight: 18 + s.h * 4 });
    });
  }
  if (save) items.push({ at: 60, text: `${save.p.name} closed it out for the save.`, weight: 12 });
  if (innings > 9 && !walkoff) items.push({ at: 61, text: `It took ${innings} innings to decide.`, weight: 10 });

  const top = [...items].sort((a, b) => b.weight - a.weight);
  const note = top[0]?.text ?? `${winner === Y ? label : "The Dodgers"} won ${Math.max(Y.runs, L.runs)}-${Math.min(Y.runs, L.runs)}.`;
  const highlights = top.slice(0, 6).sort((a, b) => a.at - b.at).map((x) => x.text);
  return { note, highlights };
}

// ---------- series ----------

/** Your club gets your drafted players with best-season ratings regressed. */
export function buildYourClub(lineup: Batter[], rotation: Pitcher[], relievers: Pitcher[], label = DEFAULT_TEAM): Club {
  const order = lineup.map(regressPlayer).sort((a, b) => b.rating - a.rating);
  // bat the best on-base types near the top: 2nd-best leads off, best bats 3rd
  const batting = [order[1], order[3], order[0], order[2], order[4], order[5], order[6], order[7], order[8]];
  const pen = relievers.map(regressPlayer).sort((a, b) => b.rating - a.rating);
  return {
    key: "YOU",
    label,
    lineup: batting,
    rotation: rotation.map(regressPlayer),
    closer: pen[0],
    setup: pen.slice(1),
    mopUp: [],
  };
}

function withMopUp(club: Club, gameNo: number): Club {
  // starters who aren't pitching today or tomorrow can work long relief
  const r = club.rotation;
  const today = (gameNo - 1) % r.length;
  const extra = r.filter((_, i) => i !== today && i !== (today + 1) % r.length);
  return { ...club, mopUp: [...club.mopUp, ...extra] };
}

export function playSeries(you: Club, lad: Club, rand: () => number = Math.random, detail = true): GameDetail[] {
  const games: GameDetail[] = [];
  let w = 0;
  let l = 0;
  for (let g = 1; w < 4 && l < 4; g++) {
    const starters = { you: you.rotation[(g - 1) % you.rotation.length], lad: lad.rotation[(g - 1) % lad.rotation.length] };
    const res = playGame(g, withMopUp(you, g), withMopUp(lad, g), starters, rand, detail);
    if (res.you > res.lad) w++;
    else l++;
    games.push(res);
  }
  return games;
}

export function seriesOdds(you: Club, lad: Club, runs = 2000): { sweep: number; series: number } {
  let sweeps = 0;
  let wins = 0;
  for (let i = 0; i < runs; i++) {
    const games = playSeries(you, lad, Math.random, false);
    const w = games.filter((g) => g.you > g.lad).length;
    if (w === 4) wins++;
    if (w === 4 && games.length === 4) sweeps++;
  }
  return { sweep: sweeps / runs, series: wins / runs };
}
