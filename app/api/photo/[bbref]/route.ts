// Finds a freely licensed photo of a player on Wikimedia Commons, looked up
// through Wikidata by the player's Baseball-Reference ID (property P1825).
// Responds with a redirect to the image, cached at Vercel's edge for 30 days.
// No photo found -> 404, and the card shows the player's initials instead.

const WIKIDATA = "https://query.wikidata.org/sparql";
const MONTH = 60 * 60 * 24 * 30;

export async function GET(_req: Request, ctx: { params: Promise<{ bbref: string }> }) {
  const { bbref } = await ctx.params;
  if (!/^[a-z.'-]{2,12}\d{2}$/.test(bbref)) {
    return new Response("Bad player id", { status: 400 });
  }

  const query = `SELECT ?img WHERE { ?p wdt:P1825 "${bbref}" . ?p wdt:P18 ?img . } LIMIT 1`;
  try {
    const res = await fetch(`${WIKIDATA}?format=json&query=${encodeURIComponent(query)}`, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "SweepTheDodgers/1.0 (fan-made baseball game)",
      },
      next: { revalidate: MONTH },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as { results?: { bindings?: { img?: { value: string } }[] } };
      const img = data.results?.bindings?.[0]?.img?.value;
      if (img) {
        const url = `${img.replace(/^http:/, "https:")}?width=320`;
        return new Response(null, {
          status: 302,
          headers: { Location: url, "Cache-Control": `public, s-maxage=${MONTH}, stale-while-revalidate=86400` },
        });
      }
    }
  } catch {
    // fall through to 404
  }
  return new Response("No photo", { status: 404, headers: { "Cache-Control": "public, s-maxage=86400" } });
}
