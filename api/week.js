import { ESPN_WEEK } from "../live.js";

export default async function handler(req, res) {
  const week = Number(req.query.week);
  if (!(week >= 1 && week <= 18)) return res.status(400).json({ error: "week must be 1 to 18" });
  const upstream = await fetch(ESPN_WEEK(week), { headers: { "User-Agent": "Mozilla/5.0 (the-slate proxy)" } });
  if (!upstream.ok) return res.status(502).json({ error: `espn ${upstream.status}` });
  const json = await upstream.json();
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).json(json.content.schedule);
}
