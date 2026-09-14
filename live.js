// Shared by the browser (slate.js), the Vercel proxy (api/week.js) and the bake script. No imports on purpose.

export const SEASON = 2026;
export const ESPN_WEEK = (week) => `https://cdn.espn.com/core/nfl/schedule?xhr=1&year=${SEASON}&week=${week}`;

export function compact(g, weekNo) {
  const comp = g.competitions[0];
  const side = (ha) => comp.competitors.find((c) => c.homeAway === ha);
  const team = (c) => ({
    id: c.team.id,
    abbr: c.team.abbreviation,
    name: c.team.displayName,
    short: c.team.shortDisplayName,
    color: `#${c.team.color ?? "333333"}`,
    alt: `#${c.team.alternateColor ?? "ffffff"}`,
    record: c.records?.[0]?.summary ?? null,
    score: comp.status.type.state === "pre" ? null : Number(c.score),
    winner: c.winner ?? null,
  });
  const odds = comp.odds?.[0];
  return {
    id: g.id,
    week: weekNo,
    kickoff: g.date,
    timeValid: comp.timeValid !== false,
    final: Boolean(comp.status.type.completed),
    state: comp.status.type.state,
    clock: comp.status.type.state === "in" ? `${comp.status.displayClock ?? ""} Q${comp.status.period ?? ""}` : null,
    home: team(side("home")),
    away: team(side("away")),
    spread: typeof odds?.spread === "number" ? odds.spread : null,
    favorite: odds?.homeTeamOdds?.favorite ? "home" : odds?.awayTeamOdds?.favorite ? "away" : null,
    venue: comp.venue?.fullName ?? null,
    city: comp.venue?.address?.city ?? null,
  };
}

export function compactWeek(scheduleByDay, weekNo) {
  return Object.values(scheduleByDay).flatMap((day) => day.games.map((g) => compact(g, weekNo)));
}

// Direct first (works from PH and, per the plan, to be confirmed from Perth); the syd1 proxy only if the direct call fails.
export async function fetchWeekLive(week, { fetchImpl = fetch, proxy = "/api/week" } = {}) {
  const direct = await fetchImpl(ESPN_WEEK(week)).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).catch(() => null);
  if (direct) return compactWeek(direct.content.schedule, week);
  const viaProxy = await fetchImpl(`${proxy}?week=${week}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
  return compactWeek(viaProxy, week);
}
