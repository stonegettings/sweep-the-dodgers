import { ImageResponse } from "next/og";
import { headline, namedHeadline } from "@/lib/share";
import { loadResult } from "@/lib/results";

// The card people see when a result link is posted to X, iMessage or Slack.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A Sweep the Dodgers series result";

const GREEN = "#173a2c";
const PLATE = "#0a2018";
const CHALK = "#eef2ec";
const LAMP = "#f4c430";
const LAD = "#6ea3ee";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const d = await loadResult(code);
  const games = d?.g ?? [];
  const h = headline(games);
  const youW = games.filter(([y, l]) => y > l).length;
  const title = namedHeadline(games, d?.n);
  const teamLabel = d?.n && d.n.length <= 10 ? d.n : "Their team";

  const row = (label: string, color: string, side: 0 | 1) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 230, fontSize: 44, fontWeight: 800, color }}>{label}</div>
      {Array.from({ length: 7 }, (_, i) => {
        const g = games[i];
        const won = g && (side === 0 ? g[0] > g[1] : g[1] > g[0]);
        return (
          <div
            key={i}
            style={{
              width: 86,
              height: 92,
              background: PLATE,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 60,
              fontWeight: 900,
              color: won ? LAMP : CHALK,
            }}
          >
            {g ? String(g[side]) : ""}
          </div>
        );
      })}
      <div
        style={{
          width: 110,
          height: 92,
          border: "3px solid #2f6450",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 60,
          fontWeight: 900,
          color: CHALK,
        }}
      >
        {String(side === 0 ? youW : games.length - youW)}
      </div>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: h.sweep ? LAMP : GREEN,
          display: "flex",
          flexDirection: "column",
          padding: 56,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 34, color: h.sweep ? GREEN : "#b9c9bf", display: "flex" }}>Sweep the Dodgers</div>
        <div style={{ fontSize: title.length > 30 ? 66 : title.length > 22 ? 78 : 92, fontWeight: 900, color: h.sweep ? GREEN : CHALK, lineHeight: 1, marginTop: 8, display: "flex" }}>
          {title}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 40, background: GREEN, padding: 20 }}>
          {row(teamLabel, CHALK, 0)}
          {row("Dodgers", LAD, 1)}
        </div>
        <div style={{ fontSize: 28, color: h.sweep ? GREEN : "#b9c9bf", marginTop: 28, display: "flex" }}>
          {d ? `${(d.t ?? d.r.slice(0, 3)).join(" / ")}${d.o ? `   ·   sweeps ${d.o[0]}% of the time` : ""}` : ""}
        </div>
      </div>
    ),
    size,
  );
}
