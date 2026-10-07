// Packs a finished series into a short URL-safe string for share links and cards.
// Works on the server (Buffer) and in the browser (btoa), so a player can add a
// team name to the link after the series without another server call.

export type ShareData = {
  r: string[]; // roster names in slot order: C, 1B, 2B, 3B, SS, LF, CF, RF, DH, 4 starters, 3 relievers
  t?: string[]; // the three best hitters, for the preview card
  g: [number, number][]; // [your runs, Dodgers runs] per game
  o?: [number, number]; // this roster's odds in percent: [sweep, series win]
  n?: string; // team name the player chose
};

export const ROSTER_LABELS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "SP1", "SP2", "SP3", "SP4", "RP", "RP", "RP"];

function toB64Url(s: string): string {
  const b = typeof Buffer !== "undefined" ? Buffer.from(s, "utf8").toString("base64") : btoa(unescape(encodeURIComponent(s)));
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): string {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  return typeof Buffer !== "undefined" ? Buffer.from(b, "base64").toString("utf8") : decodeURIComponent(escape(atob(b)));
}

/** Letters, numbers, spaces and simple punctuation, at most 24 characters. */
export function cleanTeamName(s: unknown): string {
  return String(s ?? "")
    .replace(/[^\p{L}\p{N} '&.\-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

export function encodeShare(d: ShareData): string {
  return toB64Url(JSON.stringify(d));
}

export function decodeShare(code: string): ShareData | null {
  try {
    const d = JSON.parse(fromB64Url(code)) as ShareData;
    if (!Array.isArray(d.r) || !Array.isArray(d.g) || d.r.length !== 16) return null;
    if (d.g.length < 4 || d.g.length > 7) return null;
    const clean = (xs: unknown[]) => xs.map((x) => String(x).slice(0, 40));
    const pct = (x: unknown) => Math.max(0, Math.min(100, Math.round(Number(x) || 0)));
    const name = cleanTeamName(d.n);
    return {
      r: clean(d.r),
      t: Array.isArray(d.t) ? clean(d.t).slice(0, 3) : clean(d.r).slice(0, 3),
      g: d.g.map(([a, b]) => [Math.min(99, Number(a) || 0), Math.min(99, Number(b) || 0)]),
      ...(Array.isArray(d.o) ? { o: [pct(d.o[0]), pct(d.o[1])] as [number, number] } : {}),
      ...(name ? { n: name } : {}),
    };
  } catch {
    return null;
  }
}

/** One-line headline for a finished series. */
export function headline(games: [number, number][]): { text: string; sweep: boolean; won: boolean } {
  const w = games.filter(([y, l]) => y > l).length;
  const l = games.length - w;
  if (w === 4 && l === 0) return { text: "Swept the Dodgers, 4-0", sweep: true, won: true };
  if (w === 4) return { text: `Beat the Dodgers in ${games.length}`, sweep: false, won: true };
  if (w === 0) return { text: "Swept by the Dodgers, 0-4", sweep: false, won: false };
  return { text: `Dodgers win in ${games.length}`, sweep: false, won: false };
}

/** The headline with the team's name in it, for share cards and link previews. */
export function namedHeadline(games: [number, number][], name?: string): string {
  const h = headline(games);
  if (!name) return h.text;
  const w = games.filter(([y, l]) => y > l).length;
  if (h.sweep) return `${name} swept the Dodgers, 4-0`;
  if (h.won) return `${name} beat the Dodgers in ${games.length}`;
  if (w === 0) return `${name} got swept by the Dodgers`;
  return `${name} fell to the Dodgers in ${games.length}`;
}

/** What gets posted with the link. */
export function shareText(d: ShareData): string {
  const h = headline(d.g);
  const stars = (d.t ?? []).slice(0, 3);
  const withWho = stars.length ? ` with ${stars.slice(0, -1).join(", ")}${stars.length > 1 ? " and " : ""}${stars[stars.length - 1]}` : "";
  const subject = d.n ? `${d.n}` : "My all-time team";
  if (h.sweep) return `${subject} swept the two-time champion Dodgers 4-0${withWho}.${d.o ? ` This roster only sweeps ${d.o[0]}% of the time.` : ""} Can you do it?`;
  if (h.won) return `${subject} knocked off the Dodgers in ${d.g.length}${withWho}. Think you can sweep them?`;
  return `The Dodgers beat ${d.n ?? "my all-time team"} in ${d.g.length}. Can your draft take down the champs?`;
}
