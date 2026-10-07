import type { GameDetail } from "@/lib/sim";

/** The outfield scoreboard: one column per game, plus series wins. */
export default function Scoreboard({ games, revealed, teamName = "Your team" }: { games: GameDetail[]; revealed: number; teamName?: string }) {
  const shown = games.slice(0, revealed);
  const youW = shown.filter((g) => g.you > g.lad).length;
  const ladW = shown.length - youW;
  const cells = Array.from({ length: 7 }, (_, i) => shown[i]);

  return (
    <div className="board" role="table" aria-label="Series scoreboard">
      <div className="board-row board-head" role="row">
        <span className="board-team" role="columnheader">
          World Series
        </span>
        {cells.map((_, i) => (
          <span key={i} className="board-cell board-label" role="columnheader">
            {i + 1}
          </span>
        ))}
        <span className="board-cell board-label board-total" role="columnheader">
          W
        </span>
      </div>
      {(["you", "lad"] as const).map((side) => (
        <div className={`board-row board-${side}`} role="row" key={side}>
          <span className="board-team" role="rowheader">
            {side === "you" ? teamName : "Dodgers"}
          </span>
          {cells.map((g, i) => {
            const won = g && (side === "you" ? g.you > g.lad : g.lad > g.you);
            return (
              <span key={`${i}-${g ? "on" : "off"}`} className={`board-cell${g ? " flip" : ""}${won ? " won" : ""}`} role="cell">
                {g ? (side === "you" ? g.you : g.lad) : ""}
              </span>
            );
          })}
          <span className="board-cell board-total" role="cell">
            {shown.length ? (side === "you" ? youW : ladW) : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
