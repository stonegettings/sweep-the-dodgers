import { ROSTER_LABELS, headline, namedHeadline, type ShareData } from "@/lib/share";

/** The shareable result: headline, game scores, stars, odds and the full roster. */
export default function ShareCard({ data }: { data: ShareData }) {
  const h = headline(data.g);
  const stars = data.t ?? [];
  const lineup = data.r.slice(0, 9);
  const staff = data.r.slice(9);
  return (
    <article className={`share-card${h.sweep ? " is-sweep" : h.won ? " is-win" : " is-loss"}`}>
      <p className="sc-brand">Sweep the Dodgers</p>
      <h2 className="sc-head">{namedHeadline(data.g, data.n)}</h2>

      <ol className="sc-games" aria-label="Game scores">
        {data.g.map(([y, l], i) => (
          <li key={i} className={y > l ? "sc-w" : "sc-l"}>
            <span className="sc-g">G{i + 1}</span>
            <span className="sc-score">
              {y}-{l}
            </span>
          </li>
        ))}
      </ol>

      {stars.length > 0 && <p className="sc-stars">Led by {stars.slice(0, -1).join(", ")}{stars.length > 1 ? " and " : ""}{stars[stars.length - 1]}.</p>}
      {data.o && (
        <p className="sc-odds">
          This roster sweeps the champs {data.o[0]}% of the time and wins the series {data.o[1]}%.
        </p>
      )}

      <div className="sc-roster">
        <ul aria-label="Lineup">
          {lineup.map((name, i) => (
            <li key={i}>
              <span className="sc-pos">{ROSTER_LABELS[i]}</span>
              {name}
            </li>
          ))}
        </ul>
        <ul aria-label="Pitching staff">
          {staff.map((name, i) => (
            <li key={i}>
              <span className="sc-pos">{ROSTER_LABELS[i + 9]}</span>
              {name}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
