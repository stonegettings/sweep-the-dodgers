"use client";

import { useEffect, useRef, useState } from "react";
import PlayerPhoto from "./PlayerPhoto";
import Scoreboard from "./Scoreboard";
import GameCard from "./GameCard";
import Recap from "./Recap";
import ShareBox from "./ShareBox";
import { track } from "@vercel/analytics";
import {
  MAX_PICKS_PER_SPIN,
  SKIPS_PER_DRAFT,
  SLOTS,
  canFill,
  positionText,
  type PublicPlayer,
  type SeriesResult,
  type Slot,
  type SlotKey,
  type SpinResult,
} from "@/lib/types";
import { TEAM_NAME_MAX, cleanTeamName, headline } from "@/lib/share";
import { APP_VERSION } from "@/lib/site";
import { move, moveOptions, place, placementsFor, reachableSlots, type Placement } from "@/lib/roster";

type Opponent = { lineup: { name: string; pos: string }[]; rotation: string[]; closer: string };
type Pick = PublicPlayer & { poolId: string };

const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020];
const REVEAL_MS = 1600;
const MIN_SPIN_MS = 1200;
const GROUPS: { key: Slot["group"]; title: string }[] = [
  { key: "lineup", title: "Lineup" },
  { key: "rotation", title: "Rotation" },
  { key: "bullpen", title: "Bullpen" },
];

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Game({
  reelTeams,
  opponent,
  preview = false,
  siteUrl,
}: {
  reelTeams: string[];
  opponent: Opponent;
  preview?: boolean;
  siteUrl?: string;
}) {
  const [picks, setPicks] = useState<Partial<Record<SlotKey, Pick>>>({});
  const [spinResult, setSpinResult] = useState<SpinResult | null>(null);
  const [takenThisSpin, setTakenThisSpin] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [reel, setReel] = useState<{ team: string; decade: number } | null>(null);
  const [seenPools, setSeenPools] = useState<string[]>([]);
  const [skipsLeft, setSkipsLeft] = useState(SKIPS_PER_DRAFT);
  const [result, setResult] = useState<SeriesResult | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SlotKey | null>(null);
  const [teamName, setTeamName] = useState("");
  const team = cleanTeamName(teamName);
  const teamLabel = team || "Your team";

  // A friend's shared link can pass a name along: /?team=The%20Comeback%20Kids
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get("team");
    if (fromLink) setTeamName(cleanTeamName(fromLink));
  }, []);
  const verdictRef = useRef<HTMLDivElement>(null);

  const openSlots = SLOTS.filter((s) => !picks[s.key]);
  const filled = SLOTS.length - openSlots.length;
  const rosterFull = openSlots.length === 0;
  const done = result !== null && revealed >= result.games.length;
  const draftedIds = new Set(Object.values(picks).map((p) => p!.id));
  const onCard = (spinResult?.players ?? []).filter((p) => !draftedIds.has(p.id));
  const anyFits = onCard.some((p) => placementsFor(p, picks).length > 0);
  const spinMaxed = takenThisSpin >= MAX_PICKS_PER_SPIN;

  // Reveal the series one game at a time.
  useEffect(() => {
    if (!result || revealed >= result.games.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), prefersReducedMotion() ? 0 : REVEAL_MS);
    return () => clearTimeout(t);
  }, [result, revealed]);

  useEffect(() => {
    if (done) verdictRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }, [done]);

  async function doSpin(kind: "spin" | "skip") {
    if (spinning) return;
    setError(null);
    setSpinning(true);
    setSpinResult(null);
    const reduce = prefersReducedMotion();
    const ticker = reduce
      ? null
      : setInterval(() => {
          setReel({
            team: reelTeams[Math.floor(Math.random() * reelTeams.length)],
            decade: DECADES[Math.floor(Math.random() * DECADES.length)],
          });
        }, 70);
    const started = Date.now();
    try {
      const res = await fetch("/api/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openSlots: reachableSlots(picks),
          taken: Object.values(picks).map((p) => p!.id),
          seenPools: seenPools.slice(-40),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The spin didn't go through. Try again.");
      const wait = reduce ? 0 : Math.max(0, MIN_SPIN_MS - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));
      setSpinResult(data as SpinResult);
      setTakenThisSpin(0);
      setReel({ team: data.team, decade: data.decade });
      setSeenPools((s) => [...s, data.poolId]);
      if (kind === "skip") setSkipsLeft((n) => n - 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The spin didn't go through. Try again.");
      setReel(null);
    } finally {
      if (ticker) clearInterval(ticker);
      setSpinning(false);
    }
  }

  function draft(p: PublicPlayer, pl: Placement) {
    if (!spinResult || spinMaxed) return;
    if (!pl.bump && picks[pl.slot]) return;
    setPicks((cur) => place(cur, { ...p, poolId: spinResult.poolId }, pl));
    setTakenThisSpin((n) => n + 1);
    setSelected(null);
  }

  function moveTo(from: SlotKey, to: SlotKey) {
    if (result) return;
    setPicks((cur) => move(cur, from, to));
    setSelected(null);
  }

  function release(key: SlotKey) {
    if (result) return;
    const p = picks[key];
    if (p && spinResult && p.poolId === spinResult.poolId) setTakenThisSpin((n) => Math.max(0, n - 1));
    setPicks((cur) => {
      const next = { ...cur };
      delete next[key];
      return next;
    });
    setSelected(null);
  }

  async function playSeries() {
    setError(null);
    setPlaying(true);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team, picks: Object.fromEntries(Object.entries(picks).map(([k, p]) => [k, p!.id])) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The series couldn't start. Try again.");
      setRevealed(0);
      setResult(data as SeriesResult);
      const r = data as SeriesResult;
      track("series_played", { result: r.sweep ? "sweep" : r.youWins === 4 ? "win" : "loss", games: r.games.length });
      setSpinResult(null);
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The series couldn't start. Try again.");
    } finally {
      setPlaying(false);
    }
  }

  function newDraft() {
    setPicks({});
    setSelected(null);
    setSpinResult(null);
    setTakenThisSpin(0);
    setReel(null);
    setSeenPools([]);
    setSkipsLeft(SKIPS_PER_DRAFT);
    setResult(null);
    setRevealed(0);
    setError(null);
    window.scrollTo({ top: 0 });
  }

  const verdict = result && done ? headline(result.games.map((g) => [g.you, g.lad])) : null;
  const shownGames = result ? result.games.slice(0, revealed) : [];

  // What the spin button says and whether it's allowed.
  let spinAction: { label: string; kind: "spin" | "skip"; primary: boolean } | null = null;
  if (!spinResult) spinAction = { label: "Spin", kind: "spin", primary: true };
  else if (takenThisSpin > 0 || !anyFits) spinAction = { label: "Spin the next team", kind: "spin", primary: true };
  else if (skipsLeft > 0) spinAction = { label: `Skip this team (${skipsLeft} left)`, kind: "skip", primary: false };

  return (
    <main className="page">
      <header className="masthead">
        <h1 className="title">Sweep the Dodgers</h1>
        <p className="lede">
          The Dodgers are going for three titles in a row. Spin a franchise and a decade, take up to three of its players,
          and build a 16-man roster from baseball history. Then try to beat the champs four straight.
        </p>
      </header>

      <section className="board-wrap" aria-live="polite">
        <Scoreboard games={result?.games ?? []} revealed={revealed} teamName={teamLabel} />
        {result && !done && (
          <div className="board-status">
            <span>Game {Math.min(revealed + 1, result.games.length)} in progress</span>
            <button className="linkish" onClick={() => setRevealed(result.games.length)}>
              Show every game
            </button>
          </div>
        )}
      </section>

      {verdict && result && (
        <section className={`verdict ${verdict.sweep ? "is-sweep" : verdict.won ? "is-win" : "is-loss"}`} ref={verdictRef}>
          <h2 className="verdict-title">{verdict.text}</h2>
          <p className="odds">
            Played 2,000 times, this roster sweeps the Dodgers {Math.round(result.odds.sweep * 100)}% of the time and wins the
            series {Math.round(result.odds.series * 100)}% of the time.
          </p>
          <div className="actions">
            <button className="btn btn-ghost" onClick={newDraft}>
              Start a new draft
            </button>
          </div>
        </section>
      )}

      {verdict && result && <ShareBox code={result.share} preview={preview} initialName={team} siteUrl={siteUrl} />}

      {verdict && result && <Recap games={result.games} team={team || undefined} />}

      {shownGames.length > 0 && (
        <section className="games" aria-label="Game details">
          {(done ? shownGames : [...shownGames].reverse()).map((g) => (
            <GameCard key={g.game} game={g} teamName={teamLabel} />
          ))}
        </section>
      )}

      {!result && (
        <section className="team-bar" aria-label="Team name">
          <label className="field-label" htmlFor="team-name-main">
            Name your team{" "}
            <span className="optional">
              ({teamName.length}/{TEAM_NAME_MAX})
            </span>
          </label>
          <input
            id="team-name-main"
            className="text-input team-input"
            value={teamName}
            maxLength={TEAM_NAME_MAX}
            placeholder="e.g. The Comeback Kids"
            onChange={(e) => setTeamName(e.target.value.slice(0, TEAM_NAME_MAX))}
            onBlur={() => setTeamName(team)}
            autoComplete="off"
          />
          <p className="team-hint">It goes on the scoreboard, the game recaps and your share card. You can change it until the first pitch.</p>
        </section>
      )}

      <div className={`field${result ? " is-done" : ""}`}>
        <section className="lineup" aria-labelledby="lineup-h">
          <h2 id="lineup-h" className="section-h">
            Your roster <span className="count">{filled} of 16</span>
          </h2>
          {GROUPS.map((grp) => (
            <div key={grp.key} className="slot-group">
              <h3 className="group-h">{grp.title}</h3>
              <ul className="slots">
                {SLOTS.filter((s) => s.group === grp.key).map((s) => {
                  const p = picks[s.key];
                  const isSel = selected === s.key && !!p && !result;
                  const options = isSel ? moveOptions(picks, s.key) : [];
                  return (
                    <li key={s.key} className={`slot${p ? " filled" : ""}${isSel ? " is-selected" : ""}`}>
                      <span className="slot-label">{s.label}</span>
                      {p ? (
                        <button
                          className="slot-player"
                          onClick={() => setSelected(isSel ? null : s.key)}
                          disabled={!!result}
                          aria-expanded={isSel}
                          title={result ? undefined : `Move or remove ${p.name}`}
                        >
                          <PlayerPhoto bbref={p.bbref} name={p.name} size="sm" />
                          <span className="slot-name">{p.name}</span>
                        </button>
                      ) : (
                        <span className="slot-empty">Open</span>
                      )}
                      {isSel && (
                        <div className="slot-menu">
                          {options.length > 0 ? (
                            <>
                              <span className="slot-menu-label">Move to</span>
                              <div className="slot-menu-chips">
                                {options.map((o) => (
                                  <button key={o.to} className="chip chip-small" onClick={() => moveTo(s.key, o.to)}>
                                    {o.label}
                                    {o.swapWith && <small>swap with {o.swapWith}</small>}
                                  </button>
                                ))}
                              </div>
                            </>
                          ) : (
                            <span className="slot-menu-label">No open spot or swap is available for him right now.</span>
                          )}
                          <button className="linkish slot-remove" onClick={() => release(s.key)}>
                            Remove {p!.name.split(" ").slice(-1)[0]} from the roster
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {rosterFull && !result && (
            <button className="btn btn-lamp btn-wide" onClick={playSeries} disabled={playing}>
              {playing ? "Starting the series" : "Play the series"}
            </button>
          )}
        </section>

        {!rosterFull && !result && (
          <section className="draft" aria-labelledby="draft-h">
            <h2 id="draft-h" className="section-h">
              {filled === 0 ? "Spin for your first team" : `${openSlots.length} spots left`}
            </h2>
            <div className={`reel${spinning ? " is-spinning" : ""}`} aria-live="polite">
              {reel ? (
                <>
                  <span className="reel-decade">{reel.decade}s</span>
                  <span className="reel-team">{reel.team}</span>
                </>
              ) : (
                <span className="reel-idle">Franchise and decade</span>
              )}
            </div>
            {spinResult && !spinning && (
              <p className="hint">
                {spinMaxed
                  ? "That's three from this team. Spin the next one."
                  : `Take up to ${MAX_PICKS_PER_SPIN} players from this team. ${takenThisSpin} taken so far.`}
              </p>
            )}
            <div className="actions">
              {spinAction && (
                <button className={`btn ${spinAction.primary ? "btn-lamp" : "btn-ghost"}`} onClick={() => doSpin(spinAction!.kind)} disabled={spinning}>
                  {spinning ? "Spinning" : spinAction.label}
                </button>
              )}
              {spinResult && !spinAction && <p className="hint">Take at least one player before spinning again.</p>}
            </div>
            {spinResult && !spinning && (
              <ul className="cards">
                {onCard.map((p) => {
                  const choices = placementsFor(p, picks);
                  return (
                    <li key={p.id}>
                      <div className={`card${choices.length === 0 ? " is-blocked" : ""}`}>
                        <PlayerPhoto bbref={p.bbref} name={p.name} />
                        <span className="card-name">{p.name}</span>
                        <span className="card-pos">{positionText(p)}</span>
                        {choices.length > 0 ? (
                          <div className="card-add" role="group" aria-label={`Add ${p.name}`}>
                            {choices.map((c) => (
                              <button
                                key={c.slot}
                                className={`chip${c.bump ? " chip-bump" : ""}`}
                                disabled={spinMaxed}
                                onClick={() => draft(p, c)}
                                aria-label={c.bump ? `Add ${p.name} at ${c.label}, moving ${c.bump.name} to ${c.bump.toLabel}` : `Add ${p.name} at ${c.label}`}
                              >
                                {c.label}
                                {c.bump && <small>{c.bump.name} to {c.bump.toLabel}</small>}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="card-note">No open spot</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        <aside className="opponent" aria-labelledby="opp-h">
          <h2 id="opp-h" className="section-h">
            Who you&apos;re facing
          </h2>
          <ol className="opp-list">
            {opponent.lineup.map((p) => (
              <li key={p.name}>
                <span>{p.name}</span>
                <span className="opp-pos">{p.pos}</span>
              </li>
            ))}
          </ol>
          <p className="opp-staff">
            Rotation: {opponent.rotation.join(", ")}. Closer: {opponent.closer}.
          </p>
        </aside>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <footer className="foot">
        <details>
          <summary>How the series is decided</summary>
          <p>
            Every player is rated on his best season with that team in that decade, compared to his league: OPS+ for hitters
            and ERA+ for pitchers, adjusted for ballpark. Because a best season flatters a player, drafted ratings are pulled
            partway back toward average. The Dodgers are rated on their 2025 seasons.
          </p>
          <p>
            Games are played one plate appearance at a time. Each at-bat&apos;s odds of a walk, strikeout, hit or home run
            depend on the hitter against the pitcher on the mound. Your four starters pitch in order, starters usually go six
            innings, and your best reliever closes. Hitters can play any position they logged 20 or more games at in their
            career.
          </p>
        </details>
        <p className="fine">
          A fan-made game, not affiliated with MLB or any team. Stats from the Lahman Baseball Database (CC BY-SA 3.0). Player
          photos from Wikimedia Commons under their respective licenses.
         Version {APP_VERSION}.</p>
      </footer>
    </main>
  );
}
