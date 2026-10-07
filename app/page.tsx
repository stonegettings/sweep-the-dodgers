import Game from "@/components/Game";
import { dodgers, reelTeams } from "@/lib/pools";
import { siteUrl } from "@/lib/site";

export default function Home() {
  const opponent = {
    lineup: dodgers.lineup.map((p) => ({ name: p.name, pos: p.pos })),
    rotation: dodgers.rotation.map((p) => p.name),
    closer: dodgers.closer.name,
  };
  return <Game reelTeams={reelTeams} opponent={opponent} siteUrl={siteUrl()} />;
}
