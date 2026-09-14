import { writeFile, mkdir } from "node:fs/promises";
import { compactWeek, ESPN_WEEK } from "../live.js";

const SEASON = 2026;
const UA = { "User-Agent": "Mozilla/5.0 (the-slate bake)" };

async function week(n) {
  const res = await fetch(ESPN_WEEK(n), { headers: UA });
  if (!res.ok) throw new Error(`${res.status} week ${n}`);
  const json = await res.json();
  return compactWeek(json.content.schedule, n);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const weeks = await Promise.all(Array.from({ length: 18 }, (_, i) => week(i + 1)));
  const games = weeks.flat();
  await mkdir("data", { recursive: true });
  await writeFile("data/season-2026.json", JSON.stringify({ season: SEASON, bakedAt: new Date().toISOString(), games }, null, 1) + "\n");
  console.log(`${games.length} games, ${games.filter((g) => g.final).length} final, ${games.filter((g) => !g.timeValid).length} without a set time`);
}
