// The broadcast recap: what the AI is told, and a plain fallback when no AI is connected.

export type RecapGame = {
  game: number;
  you: number;
  lad: number;
  home: "YOU" | "LAD";
  innings: number;
  highlights: string[];
  decisions: { w: string; l: string; s?: string };
};

export const RECAP_INSTRUCTIONS = `You are a veteran World Series radio play-by-play announcer calling a fantasy best-of-seven series.
One side is the listener's team, an all-time roster they drafted from baseball history. The other is the 2026 Los Angeles Dodgers, two-time defending champions chasing a three-peat.
Write a recap of the whole series in 3 short paragraphs, about 160 words total, in the voice of a radio call: vivid, warm, a little dramatic.
Use ONLY the scores, names and plays in the facts provided. Never invent statistics, plays, injuries or quotes.
If the facts give the listener's team a name, call the team by that name; otherwise call it "your club" or "your guys". No headings, no bullet points, no markdown.`;

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const int = (x: unknown) => Math.max(0, Math.min(99, Math.round(Number(x) || 0)));

/** Accepts only the fields a recap needs, with tight limits, so the endpoint can't be used as a general chatbot. */
export function sanitizeGames(input: unknown): RecapGame[] | null {
  if (!Array.isArray(input) || input.length < 4 || input.length > 7) return null;
  return input.map((g: Record<string, unknown>, i) => {
    const d = (g?.decisions ?? {}) as Record<string, unknown>;
    return {
      game: i + 1,
      you: int(g?.you),
      lad: int(g?.lad),
      home: g?.home === "YOU" ? "YOU" : "LAD",
      innings: Math.max(9, Math.min(25, int(g?.innings))),
      highlights: (Array.isArray(g?.highlights) ? g.highlights : []).slice(0, 6).map((h) => clip(h, 220)),
      decisions: { w: clip(d.w, 40), l: clip(d.l, 40), ...(d.s ? { s: clip(d.s, 40) } : {}) },
    };
  });
}

export function recapFacts(games: RecapGame[], team?: string): string {
  const T = team || "Your team";
  const w = games.filter((g) => g.you > g.lad).length;
  const l = games.length - w;
  const lines = games.map((g) => {
    const where = g.home === "LAD" ? "at Dodger Stadium" : "at your park";
    const res = g.you > g.lad ? `${T} won ${g.you}-${g.lad}` : `Dodgers won ${g.lad}-${g.you}`;
    const extra = g.innings > 9 ? ` in ${g.innings} innings` : "";
    const dec = `W: ${g.decisions.w}. L: ${g.decisions.l}.${g.decisions.s ? ` S: ${g.decisions.s}.` : ""}`;
    return `Game ${g.game} (${where}): ${res}${extra}. ${dec}\n  Plays: ${g.highlights.join(" ")}`;
  });
  const verdict = w === 4 ? (l === 0 ? `${T} SWEPT the Dodgers 4-0.` : `${T} won the series ${w}-${l}.`) : `The Dodgers won the series ${l}-${w}.`;
  const named = team ? `The listener's team is called "${team}".\n` : "The listener's team has no name.\n";
  return `${named}Series result: ${verdict}\n\n${lines.join("\n")}`;
}

/** A plain recap built from the same facts, used when the AI isn't connected. */
export function templateRecap(games: RecapGame[], team?: string): string {
  const club = team || "your club";
  const guys = team || "your guys";
  const w = games.filter((g) => g.you > g.lad).length;
  const l = games.length - w;
  const first = games[0];
  const last = games[games.length - 1];
  const opener =
    w === 4 && l === 0
      ? "Folks, it's done. Four games, four wins, and the champs never knew what hit them."
      : w === 4
        ? `It took ${games.length} games, but ${club} has knocked off the two-time champions.`
        : `The Dodgers are moving on, taking the series in ${games.length}.`;
  const g1 = `It started at Dodger Stadium with ${first.you > first.lad ? `a ${first.you}-${first.lad} win for ${guys}` : `a ${first.lad}-${first.you} Dodgers win`}. ${first.highlights[0] ?? ""}`;
  const end = `And in Game ${last.game}: ${last.highlights[0] ?? (last.you > last.lad ? `${club} closed it out.` : "the Dodgers closed it out.")}`;
  return `${opener}\n\n${g1}\n\n${end}`;
}
