// Pure season logic. No DOM, no storage, no fetch. Imported by slate.js and by tests/season.test.mjs.

export const MY_TEAM = "CIN";
const PERTH = "Australia/Perth";

export const kickoffMs = (g) => new Date(g.kickoff).getTime();

// A game locks at kickoff. A game whose time ESPN has not set yet stays open, whatever its placeholder date says.
export const isLocked = (g, now) => g.timeValid !== false && kickoffMs(g) <= now;

export const gamesInWeek = (season, week) => season.filter((g) => g.week === week).sort((a, b) => kickoffMs(a) - kickoffMs(b));

// The week to show: the earliest week that still has an unfinished game, or the last week once the season is done.
export function currentWeek(season, now) {
  const weeks = [...new Set(season.map((g) => g.week))].sort((a, b) => a - b);
  const open = weeks.find((w) => gamesInWeek(season, w).some((g) => !g.final && kickoffMs(g) + 4 * 3600e3 > now));
  return open ?? weeks[weeks.length - 1];
}

// Live data wins over the baked snapshot for time, status and scores. Anything else stays baked.
export function mergeLive(season, live) {
  const byId = new Map(live.map((g) => [g.id, g]));
  return season.map((g) => {
    const l = byId.get(g.id);
    if (!l) return g;
    return {
      ...g,
      kickoff: l.kickoff,
      timeValid: l.timeValid,
      final: l.final,
      state: l.state,
      spread: l.spread ?? g.spread,
      favorite: l.favorite ?? g.favorite,
      home: { ...g.home, record: l.home.record ?? g.home.record, score: l.home.score, winner: l.home.winner },
      away: { ...g.away, record: l.away.record ?? g.away.record, score: l.away.score, winner: l.away.winner },
    };
  });
}

// Stack order for a week: the saved order, with any new games appended and any vanished games dropped.
export function weekOrder(season, week, savedOrder = []) {
  const ids = gamesInWeek(season, week).map((g) => g.id);
  const kept = savedOrder.filter((id) => ids.includes(id));
  return [...kept, ...ids.filter((id) => !kept.includes(id))];
}

// Confidence: top of the stack is worth N, bottom is worth 1. Each value used exactly once, by construction.
export const confidenceOf = (order, id) => order.length - order.indexOf(id);

export function moveInOrder(order, id, toIndex) {
  const from = order.indexOf(id);
  if (from < 0) return order;
  const without = order.filter((x) => x !== id);
  const clamped = Math.max(0, Math.min(toIndex, without.length));
  return [...without.slice(0, clamped), id, ...without.slice(clamped)];
}

export const winnerSide = (g) => (!g.final ? null : g.home.winner ? "home" : g.away.winner ? "away" : "tie");

export const pickHit = (g, side) => (side ? winnerSide(g) === side : false);

// The underdog wins: bonus equal to the spread, rounded. Favourite wins or no line: nothing extra.
export function upsetBonus(g, side) {
  if (!side || g.spread == null || !g.favorite || !pickHit(g, side)) return 0;
  return side === g.favorite ? 0 : Math.round(Math.abs(g.spread));
}

export function scoreWeek(season, week, picks, order, { bonus = false } = {}) {
  const games = gamesInWeek(season, week);
  const rows = order.map((id) => {
    const g = games.find((x) => x.id === id);
    const side = picks[id]?.side ?? null;
    const conf = confidenceOf(order, id);
    const hit = g.final ? pickHit(g, side) : null;
    const points = hit ? conf + (bonus ? upsetBonus(g, side) : 0) : 0;
    return { id, side, conf, hit, points, final: g.final };
  });
  return {
    rows,
    points: rows.reduce((sum, r) => sum + r.points, 0),
    hits: rows.filter((r) => r.hit === true).length,
    resolved: rows.filter((r) => r.final).length,
  };
}

// Streak: consecutive correct picks across all resolved games, newest first, in kickoff order.
export function streak(season, picks) {
  const resolved = season.filter((g) => g.final && picks[g.id]?.side).sort((a, b) => kickoffMs(b) - kickoffMs(a));
  let run = 0;
  for (const g of resolved) {
    if (!pickHit(g, picks[g.id].side)) break;
    run += 1;
  }
  return run;
}

export function seasonPoints(season, picks, orders, opts) {
  const weeks = [...new Set(season.map((g) => g.week))];
  return weeks.reduce((sum, w) => sum + scoreWeek(season, w, picks, weekOrder(season, w, orders[w]), opts).points, 0);
}

export const fmtPerthDay = (iso) => new Intl.DateTimeFormat("en-AU", { timeZone: PERTH, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso)).replace(",", "");
export const fmtPerthTime = (iso) => new Intl.DateTimeFormat("en-AU", { timeZone: PERTH, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)).replace(/\s?([ap])m/i, "$1m");

export function kickoffLabel(g) {
  return g.timeValid === false ? `${fmtPerthDay(g.kickoff)}, time TBD` : `${fmtPerthDay(g.kickoff)} ${fmtPerthTime(g.kickoff)}`;
}

// Rival link: one week's picks and order in a URL hash. ids are ESPN event ids; sides are h/a/-.
export function encodeRival(week, order, picks, name) {
  const body = order.map((id) => `${id}${picks[id]?.side === "home" ? "h" : picks[id]?.side === "away" ? "a" : "-"}`).join(".");
  return `r=${week}~${encodeURIComponent(name)}~${body}`;
}

export function decodeRival(hash) {
  const m = /r=(\d+)~([^~]*)~([\d.ha-]+)/.exec(hash ?? "");
  if (!m) return null;
  const order = [];
  const picks = {};
  for (const token of m[3].split(".")) {
    const id = token.slice(0, -1);
    const s = token.slice(-1);
    order.push(id);
    if (s === "h") picks[id] = { side: "home" };
    if (s === "a") picks[id] = { side: "away" };
  }
  return { week: Number(m[1]), name: decodeURIComponent(m[2]), order, picks };
}
