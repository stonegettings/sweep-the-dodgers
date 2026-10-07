import "server-only";
import poolsData from "@/data/pools.json";
import dodgersData from "@/data/dodgers.json";
import { createEngine, type DodgerData, type Pool } from "./engine";

/** The game engine with its data, loaded once per server instance. Ratings never leave the server. */
export const engine = createEngine(poolsData as Pool[], dodgersData as unknown as DodgerData);
export const dodgers = engine.dodgers;
export const reelTeams = engine.reelTeams;
