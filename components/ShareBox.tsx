"use client";

import { useEffect, useMemo, useState } from "react";
import { track } from "@vercel/analytics";
import ShareCard from "./ShareCard";
import { cleanTeamName, decodeShare, encodeShare, shareText } from "@/lib/share";

type LinkState = { code: string; id: string | null; status: "pending" | "ready" | "fallback" };

/**
 * The end page: name your team, see the card friends will see, and send the link.
 * Links are short (/r/k7Qm2xPa) and are sent on their own, because Messages only
 * shows the scoreboard picture when a link is the whole message.
 */
export default function ShareBox({
  code,
  preview = false,
  initialName = "",
  siteUrl,
}: {
  code: string;
  preview?: boolean;
  initialName?: string;
  siteUrl?: string;
}) {
  const [name, setName] = useState(initialName);
  const [note, setNote] = useState<string | null>(null);
  const [link, setLink] = useState<LinkState | null>(null);
  const base = useMemo(() => decodeShare(code), [code]);
  const clean = cleanTeamName(name);
  const data = useMemo(() => (base ? { ...base, ...(clean ? { n: clean } : {}) } : null), [base, clean]);
  const longCode = useMemo(() => (data ? encodeShare(data) : ""), [data]);

  // Save the result for a short link once the name stops changing.
  useEffect(() => {
    if (!longCode) return;
    setLink({ code: longCode, id: null, status: "pending" });
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: longCode }),
          signal: ctl.signal,
        });
        const out = res.ok ? ((await res.json()) as { id: string }) : null;
        setLink({ code: longCode, id: out?.id ?? null, status: out?.id ? "ready" : "fallback" });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setLink({ code: longCode, id: null, status: "fallback" });
      }
    }, 600);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [longCode]);

  if (!data) return null;

  // the main site address, so friends can open it (deployment addresses are private to the owner)
  const origin = preview ? "https://sweep-the-dodgers.vercel.app" : (siteUrl ?? (typeof window !== "undefined" ? window.location.origin : ""));
  const current = link && link.code === longCode ? link : null;
  const ready = current && current.status !== "pending";
  const url = `${origin}/r/${current?.id ?? longCode}`;
  const text = shareText(data);

  async function nativeShare() {
    track("result_shared", { via: "share-sheet" });
    try {
      // The link alone, so Messages and other apps build the picture preview.
      await navigator.share({ url });
    } catch {
      // the share sheet was closed
    }
  }

  async function copy() {
    track("result_shared", { via: "copy" });
    try {
      await navigator.clipboard.writeText(url);
      setNote("Link copied. Paste it on its own in a text and the scoreboard picture shows up.");
    } catch {
      setNote("Your browser blocked copying. Tap the link below to select it, then copy.");
    }
  }

  const canNative = !preview && typeof navigator !== "undefined" && typeof navigator.share === "function";
  const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const smsUrl = `sms:?&body=${encodeURIComponent(url)}`;

  return (
    <section className="sharebox" aria-labelledby="share-h">
      <div className="sharebox-controls">
        <h2 id="share-h" className="recap-title">
          Share your result
        </h2>
        <label className="field-label" htmlFor="team-name">
          Team name <span className="optional">(optional)</span>
        </label>
        <input
          id="team-name"
          className="text-input"
          value={name}
          maxLength={24}
          placeholder="e.g. The Comeback Kids"
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
        <div className="share-actions" aria-busy={!ready}>
          {canNative && (
            <button className="btn btn-lamp" onClick={nativeShare} disabled={!ready}>
              Share
            </button>
          )}
          <button className={`btn ${canNative ? "btn-ghost" : "btn-lamp"}`} onClick={copy} disabled={!ready}>
            Copy link
          </button>
          <a
            className={`btn btn-ghost${ready ? "" : " is-disabled"}`}
            href={ready ? xUrl : undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("result_shared", { via: "x" })}
          >
            Post on X
          </a>
          <a className={`btn btn-ghost${ready ? "" : " is-disabled"}`} href={ready ? smsUrl : undefined} onClick={() => track("result_shared", { via: "text" })}>
            Text a friend
          </a>
        </div>
        {!ready && <p className="recap-hint">Making your link...</p>}
        {note && (
          <p className="recap-hint" role="status">
            {note}
          </p>
        )}
        <label className="sr-only" htmlFor="share-url">
          Link to your result
        </label>
        <input id="share-url" className="share-url" value={ready ? url : ""} readOnly onFocus={(e) => e.currentTarget.select()} />
        {preview && <p className="recap-hint">In this test version the link uses a placeholder address. Once deployed, it points at your live site.</p>}
      </div>
      <div className="sharebox-card">
        <p className="field-label">What your friends see</p>
        <ShareCard data={data} />
      </div>
    </section>
  );
}
