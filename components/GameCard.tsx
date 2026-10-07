import type { BatLine, GameDetail, PitchLine } from "@/lib/sim";

function BattingTable({ title, rows }: { title: string; rows: BatLine[] }) {
  const t = rows.reduce((a, r) => ({ ab: a.ab + r.ab, r: a.r + r.r, h: a.h + r.h, hr: a.hr + r.hr, rbi: a.rbi + r.rbi, bb: a.bb + r.bb, k: a.k + r.k }), { ab: 0, r: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0 });
  return (
    <table className="box">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">Batter</th>
          <th scope="col">AB</th>
          <th scope="col">R</th>
          <th scope="col">H</th>
          <th scope="col">HR</th>
          <th scope="col">RBI</th>
          <th scope="col">BB</th>
          <th scope="col">K</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <th scope="row">
              {r.name} <span className="box-pos">{r.pos}</span>
            </th>
            <td>{r.ab}</td>
            <td>{r.r}</td>
            <td>{r.h}</td>
            <td>{r.hr}</td>
            <td>{r.rbi}</td>
            <td>{r.bb}</td>
            <td>{r.k}</td>
          </tr>
        ))}
        <tr className="box-total">
          <th scope="row">Totals</th>
          <td>{t.ab}</td>
          <td>{t.r}</td>
          <td>{t.h}</td>
          <td>{t.hr}</td>
          <td>{t.rbi}</td>
          <td>{t.bb}</td>
          <td>{t.k}</td>
        </tr>
      </tbody>
    </table>
  );
}

function PitchingTable({ title, rows, decisions }: { title: string; rows: PitchLine[]; decisions: GameDetail["decisions"] }) {
  const tag = (name: string) => (name === decisions.w ? " (W)" : name === decisions.l ? " (L)" : name === decisions.s ? " (S)" : "");
  return (
    <table className="box">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">Pitcher</th>
          <th scope="col">IP</th>
          <th scope="col">H</th>
          <th scope="col">R</th>
          <th scope="col">BB</th>
          <th scope="col">K</th>
          <th scope="col">HR</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <th scope="row">
              {r.name}
              {tag(r.name)}
            </th>
            <td>{r.ip}</td>
            <td>{r.h}</td>
            <td>{r.r}</td>
            <td>{r.bb}</td>
            <td>{r.k}</td>
            <td>{r.hr}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One game: result, line score, highlights, decisions and a full box score. */
export default function GameCard({ game: g, teamName = "Your team" }: { game: GameDetail; teamName?: string }) {
  const won = g.you > g.lad;
  const innings = Math.max(9, g.line.you.length, g.line.lad.length);
  const away = g.home === "LAD" ? "you" : "lad";
  const rows = (away === "you" ? ["you", "lad"] : ["lad", "you"]) as ("you" | "lad")[];
  const name = { you: teamName, lad: "Dodgers" };

  return (
    <article className={`game ${won ? "game-win" : "game-loss"}`}>
      <header className="game-head">
        <h3 className="game-title">
          Game {g.game} <span className="game-venue">{g.home === "LAD" ? "at Dodger Stadium" : "at your park"}</span>
        </h3>
        <p className="game-result">
          {won ? "W" : "L"} {g.you}-{g.lad}
          {g.extras ? ` in ${g.innings}` : ""}
        </p>
      </header>

      <div className="linescore-wrap">
        <table className="linescore">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Team</span>
              </th>
              {Array.from({ length: innings }, (_, i) => (
                <th scope="col" key={i}>
                  {i + 1}
                </th>
              ))}
              <th scope="col" className="ls-rhe">
                R
              </th>
              <th scope="col" className="ls-rhe">
                H
              </th>
              <th scope="col" className="ls-rhe">
                E
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((side) => (
              <tr key={side} className={`ls-${side}`}>
                <th scope="row">{name[side]}</th>
                {Array.from({ length: innings }, (_, i) => {
                  const v = g.line[side][i];
                  return <td key={i}>{v === undefined ? "" : v === null ? "X" : v}</td>;
                })}
                <td className="ls-rhe">{g[side]}</td>
                <td className="ls-rhe">{g.hits[side]}</td>
                <td className="ls-rhe">{g.errors[side]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="highlights">
        {g.highlights.map((h, i) => (
          <li key={i}>{h}</li>
        ))}
      </ul>

      <p className="decisions">
        Win: {g.decisions.w}. Loss: {g.decisions.l}.{g.decisions.s ? ` Save: ${g.decisions.s}.` : ""}
      </p>

      <details className="boxscore">
        <summary>Box score</summary>
        <div className="box-grid">
          <div className="box-scroll"><BattingTable title={teamName} rows={g.box.you} /></div>
          <div className="box-scroll"><BattingTable title="Dodgers" rows={g.box.lad} /></div>
          <div className="box-scroll"><PitchingTable title={teamName === "Your team" ? "Your pitching" : `${teamName} pitching`} rows={g.pitching.you} decisions={g.decisions} /></div>
          <div className="box-scroll"><PitchingTable title="Dodgers pitching" rows={g.pitching.lad} decisions={g.decisions} /></div>
        </div>
      </details>
    </article>
  );
}
