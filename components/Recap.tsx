"use client";

import { useRef, useState } from "react";
import { track } from "@vercel/analytics";
import type { GameDetail } from "@/lib/sim";

function sourceLabel(source: string | null): string {
  if (!source) return "";
  if (source.startsWith("ai:")) return `Written by ${source.slice(3)} through Vercel AI Gateway.`;
  if (source === "preview-claude") return "Written by Claude (test version in chat).";
  return "Template recap. Connect AI Gateway on Vercel for the AI-written call.";
}

/** "Play the radio recap": streams an AI-written broadcast call of the series. */
export default function Recap({ games, team }: { games: GameDetail[]; team?: string }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "streaming" | "done" | "error">("idle");
  const [source, setSource] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);

  async function play() {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setText("");
    setSource(null);
    setState("loading");
    track("recap_requested");
    try {
      const res = await fetch("/api/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team,
          games: games.map((g) => ({ you: g.you, lad: g.lad, home: g.home, innings: g.innings, highlights: g.highlights, decisions: g.decisions })),
        }),
        signal: c.signal,
      });
      if (!res.ok || !res.body) throw new Error("recap failed");
      setSource(res.headers.get("X-Recap-Source"));
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let all = "";
      setState("streaming");
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        all += dec.decode(value, { stream: true });
        setText(all);
      }
      setState(all.trim() ? "done" : "error");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setState("error");
    }
  }

  return (
    <section className="recap" aria-live="polite">
      <div className="recap-head">
        <h2 className="recap-title">The radio call</h2>
        {(state === "idle" || state === "done" || state === "error") && (
          <button className="btn btn-ghost" onClick={play}>
            {state === "idle" ? "Play the recap" : "Call it again"}
          </button>
        )}
      </div>
      {state === "idle" && <p className="recap-hint">An announcer recaps your series, written live by AI from the games you just played.</p>}
      {state === "loading" && <p className="recap-hint">Warming up the booth...</p>}
      {text && (
        <div className="recap-body">
          {text
            .split(/\n\s*\n/)
            .filter((p) => p.trim())
            .map((p, i) => (
              <p key={i}>{p.trim()}</p>
            ))}
        </div>
      )}
      {state === "error" && <p className="recap-hint">The booth lost its signal. Try the recap again.</p>}
      {source && (state === "done" || state === "streaming") && <p className="recap-source">{sourceLabel(source)}</p>}
    </section>
  );
}
