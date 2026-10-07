// The AI broadcast recap: streams a radio-style call of the series, written by
// a model through Vercel AI Gateway with the AI SDK. On Vercel, the deployment
// authenticates to AI Gateway automatically (OIDC); locally, set AI_GATEWAY_API_KEY.
// With neither, the route streams a plain template recap so the game still works.
import { streamText } from "ai";
import { RECAP_INSTRUCTIONS, recapFacts, sanitizeGames, templateRecap } from "@/lib/recap";
import { cleanTeamName } from "@/lib/share";

export const maxDuration = 30;

const MODEL = process.env.RECAP_MODEL ?? "anthropic/claude-haiku-5.5";

function textResponse(text: string, source: string) {
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Recap-Source": source },
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { games?: unknown; team?: unknown };
  const team = cleanTeamName(body.team) || undefined;
  const games = sanitizeGames(body.games);
  if (!games) return new Response("A recap needs a finished series of 4 to 7 games.", { status: 400 });

  // On Vercel the deployment authenticates with OIDC, so always try there; locally a key is needed.
  const connected = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);
  if (!connected) return textResponse(templateRecap(games, team), "template");

  // Wait for the first words before answering, so a missing key, used-up
  // credits or an outage falls back to the template instead of a blank recap.
  let failed = false;
  const result = streamText({
    model: MODEL,
    instructions: RECAP_INSTRUCTIONS,
    prompt: recapFacts(games, team),
    maxOutputTokens: 450,
    temperature: 0.9,
    onError: () => {
      failed = true;
    },
  });
  const it = result.textStream[Symbol.asyncIterator]();
  let first: IteratorResult<string>;
  try {
    first = await it.next();
  } catch {
    return textResponse(templateRecap(games, team), "template");
  }
  if (first.done || failed || !first.value) return textResponse(templateRecap(games, team), "template");

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode(first.value));
    },
    async pull(c) {
      try {
        const next = await it.next();
        if (next.done) c.close();
        else c.enqueue(enc.encode(next.value));
      } catch {
        c.close();
      }
    },
    cancel() {
      it.return?.();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Recap-Source": `ai:${MODEL}` },
  });
}
