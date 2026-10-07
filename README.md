# Sweep the Dodgers

The Dodgers are going for three straight titles. Spin a franchise and a decade from the 1960s to today, take up to three of its players, and build a 16-man roster: a full lineup (C, 1B, 2B, 3B, SS, LF, CF, RF), a designated hitter, four starters and three relievers. Then try to beat the champs four straight in a best-of-seven.

Hitters can play any position they logged 20 or more games at in their career. Starters can pitch in the rotation or the bullpen. Drafting a player into a filled spot slides the current player to another position he can play, and tapping anyone on the roster lets you move him or swap two players (`lib/roster.ts`).

Built with Next.js 16 (App Router) and deployed on Vercel.

## How it works

- **Spin** (`app/api/spin`) picks a random franchise and decade and returns that roster's best players: name, position and photo only. Ratings never leave the server.
- **Simulate** (`app/api/simulate`) checks the roster rules, looks up the hidden ratings, and plays the series one plate appearance at a time (`lib/sim.ts`). Every game comes back with a line score, a full box score, winning and losing pitchers, saves and highlights. The series is then replayed 2,000 more times to report your roster's true odds.
- **Photos** (`app/api/photo/[bbref]`) find a freely licensed photo on Wikimedia Commons through Wikidata, cached at Vercel's edge for 30 days. No photo means the card shows initials.
- **Radio recap** (`app/api/recap`) streams an announcer's call of the whole series, written by an AI model through Vercel AI Gateway with the AI SDK (`streamText`). On Vercel the deployment authenticates to AI Gateway automatically. If the AI isn't reachable, the route falls back to a plain template recap.
- **Web Analytics** (`@vercel/analytics`) counts page views on any plan. On Pro it also records custom events for series played, recaps requested and results shared.
- **Sharing** (`components/ShareBox.tsx`): players name their team on the opening screen (or on a friend's results page, which passes it along as `/?team=`); the name appears on the scoreboard, game cards, highlights and radio recap. After a series they share by native share sheet, copied link, X or text. The link (`app/r/[code]`) opens a results page for friends, with the series, the roster and a "Draft your own team" button, plus a generated preview image (`opengraph-image.tsx`) for X, iMessage and Slack. Links are short (`/r/k7Qm2xPa`): each shared result is saved to Vercel Blob (`lib/results.ts`, `app/api/share`). Links are sent on their own so Messages shows the scoreboard picture. Without a Blob store, the app falls back to long links that carry the whole result.

Ratings: hitters use park-adjusted OPS+ and pitchers ERA+ from their best season with that team in that decade, 1960 onward (`data/pools.json`, built by `data/build_data.py`; change `FIRST_YEAR` there to widen or narrow the eras). The Dodgers use their 2025 numbers (`data/dodgers.json`). Data comes from the Lahman Baseball Database (CC BY-SA 3.0).

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. To try the AI recap locally, copy `.env.example` to `.env.local` and paste an AI Gateway API key.

## Deploy to Vercel

1. Create a new GitHub repository and push this folder to it.
2. Go to vercel.com/new, sign in with GitHub, and import the repository.
3. Keep the defaults and click Deploy. No environment variables are needed.
4. In the project, open **Analytics** and click **Enable** to start counting visitors.
5. For short share links, open **Storage** in your Vercel dashboard, create a **Blob** store (Private is fine), open its **Projects** tab and connect it to this project. Then redeploy once (Deployments, latest, Redeploy) so the app sees the store.
6. For the AI recap, open **AI Gateway** in your Vercel team and add a payment method to unlock its free monthly credits. The deployed app then uses it automatically, with no API key to copy. To change the model, set `RECAP_MODEL` in the project's environment variables.

Every push to `main` redeploys, and every other branch gets its own preview link.

## Tuning the difficulty

In `lib/sim.ts`, `BEST_SEASON_KEEP` controls how much drafted players' best seasons are pulled back toward average. At 0.45 a strong draft wins the series about 40% of the time and sweeps about 4-5% of the time. A careless draft wins about 26% of the time and sweeps about 2% of the time. Raise it to make the game easier, lower it to make it harder. `MAX_PICKS_PER_SPIN` and `SKIPS_PER_DRAFT` live in `lib/types.ts`.

---

A fan-made game, not affiliated with MLB or any team.
