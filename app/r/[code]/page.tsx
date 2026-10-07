import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ShareCard from "@/components/ShareCard";
import { headline, namedHeadline, shareText } from "@/lib/share";
import { loadResult } from "@/lib/results";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const d = await loadResult(code);
  if (!d) return { title: "Sweep the Dodgers" };
  const title = namedHeadline(d.g, d.n);
  const description = shareText(d);
  return {
    title: `${title} | Sweep the Dodgers`,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** The page friends land on from a shared link: the result, then an invitation to play. */
export default async function SharedResult({ params }: Props) {
  const { code } = await params;
  const d = await loadResult(code);
  if (!d) redirect("/"); // unreadable or cut-off link: send them to the game
  const h = headline(d.g);
  const challenge = h.sweep
    ? "They swept the champs. Can you match it?"
    : h.won
      ? "They beat the champs. Can you do it in four?"
      : "The champs won this one. Can your team do better?";

  return (
    <main className="page landing">
      <header className="landing-head">
        <Link href="/" className="landing-brand">
          Sweep the Dodgers
        </Link>
        <p className="lede">
          {d.n ?? "This all-time team"} was drafted from baseball history, one spin at a time, then took on the 2026
          Dodgers in a best-of-seven.
        </p>
      </header>

      <ShareCard data={d} />

      <section className="landing-cta" aria-labelledby="cta-h">
        <h2 id="cta-h" className="landing-cta-title">
          {challenge}
        </h2>
        <ol className="landing-steps">
          <li>Spin a franchise and a decade, from the 1960s to today.</li>
          <li>Take up to three of its players. Fill a 16-man roster.</li>
          <li>Play the two-time champs and try to win four straight.</li>
        </ol>
        <form action="/" method="get" className="landing-form">
          <label className="field-label" htmlFor="team">
            Name your team <span className="optional">(optional)</span>
          </label>
          <input id="team" name="team" className="text-input team-input" maxLength={24} placeholder="e.g. The Comeback Kids" autoComplete="off" />
          <button type="submit" className="btn btn-lamp landing-btn">
            Draft your own team
          </button>
        </form>
        <p className="fine">Free to play, no sign-up. A fan-made game, not affiliated with MLB or any team.</p>
      </section>
    </main>
  );
}
