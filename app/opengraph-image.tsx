import { ImageResponse } from "next/og";

// The picture shown when the game's own address is texted or posted.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Sweep the Dodgers: build a roster from baseball history and try to sweep the champs";

const GREEN = "#173a2c";
const PLATE = "#0a2018";
const CHALK = "#eef2ec";
const LAMP = "#f4c430";
const LAD = "#6ea3ee";

export default function Image() {
  const row = (label: string, color: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 230, fontSize: 44, fontWeight: 800, color, display: "flex" }}>{label}</div>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} style={{ width: 86, height: 92, background: PLATE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 54, fontWeight: 900, color: "#2f6450" }}>
          ?
        </div>
      ))}
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: GREEN, display: "flex", flexDirection: "column", padding: 56, fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 34, color: LAMP, display: "flex" }}>The champs are going for three straight</div>
        <div style={{ fontSize: 112, fontWeight: 900, color: CHALK, lineHeight: 1, marginTop: 10, display: "flex" }}>Sweep the Dodgers</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 40, border: "3px solid #2f6450", padding: 20 }}>
          {row("Your team", CHALK)}
          {row("Dodgers", LAD)}
        </div>
        <div style={{ fontSize: 30, color: "#b9c9bf", marginTop: 28, display: "flex" }}>Build a 16-man roster from baseball history. Win four straight.</div>
      </div>
    ),
    size,
  );
}
