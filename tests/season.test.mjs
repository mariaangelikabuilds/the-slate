import test from "node:test";
import assert from "node:assert/strict";
import {
  isLocked, currentWeek, mergeLive, weekOrder, confidenceOf, moveInOrder, pickHit, upsetBonus, scoreWeek, streak, kickoffLabel, encodeRival, decodeRival,
} from "../season.js";

const team = (abbr, extra = {}) => ({ id: abbr, abbr, name: abbr, short: abbr, color: "#000", alt: "#fff", record: null, score: null, winner: null, ...extra });
const game = (id, week, kickoff, extra = {}) => ({ id, week, kickoff, timeValid: true, final: false, state: "pre", home: team("H" + id), away: team("A" + id), spread: null, favorite: null, ...extra });
const finished = (id, week, kickoff, winner, extra = {}) =>
  game(id, week, kickoff, { final: true, state: "post", home: team("H" + id, { score: winner === "home" ? 24 : 17, winner: winner === "home" }), away: team("A" + id, { score: winner === "away" ? 24 : 17, winner: winner === "away" }), ...extra });

const T0 = Date.parse("2026-09-20T17:00:00Z");

test("locks at kickoff, stays open when the time is not set", () => {
  const g = game("1", 2, "2026-09-20T17:00:00Z");
  assert.equal(isLocked(g, T0 - 1), false);
  assert.equal(isLocked(g, T0), true);
  assert.equal(isLocked({ ...g, timeValid: false, kickoff: "2026-01-01T05:00:00Z" }, T0), false);
});

test("Perth labels: Sunday 1pm ET is Monday 1am Perth; Madrid game lands Sunday evening; TBD stays TBD", () => {
  assert.equal(kickoffLabel(game("1", 2, "2026-09-20T17:00Z")), "Mon 21 Sept 1:00am");
  assert.equal(kickoffLabel(game("2", 9, "2026-11-08T14:30Z")), "Sun 8 Nov 10:30pm");
  assert.equal(kickoffLabel(game("3", 2, "2026-09-18T00:15Z")), "Fri 18 Sept 8:15am");
  assert.equal(kickoffLabel(game("4", 16, "2026-12-27T05:00Z", { timeValid: false })), "Sun 27 Dec, time TBD");
});

test("current week is the first with an unfinished game, and moves on once a week is done", () => {
  const season = [finished("1", 1, "2026-09-13T17:00Z", "home"), game("2", 2, "2026-09-20T17:00Z"), game("3", 3, "2026-09-27T17:00Z")];
  assert.equal(currentWeek(season, T0 - 86400e3), 2);
  const later = mergeLive(season, [{ ...finished("2", 2, "2026-09-20T17:00Z", "away") }]);
  assert.equal(currentWeek(later, T0 + 86400e3), 3);
});

test("live merge moves a flexed kickoff and carries scores, keeps baked colours", () => {
  const baked = [game("1", 5, "2026-10-11T17:00Z")];
  const merged = mergeLive(baked, [{ ...finished("1", 5, "2026-10-12T00:20Z", "home"), home: { ...team("X", { color: "#f00", score: 30, winner: true, record: "4-1" }) } }]);
  assert.equal(merged[0].kickoff, "2026-10-12T00:20Z");
  assert.equal(merged[0].home.score, 30);
  assert.equal(merged[0].home.record, "4-1");
  assert.equal(merged[0].home.color, "#000");
});

test("order keeps saved positions, appends new games, drops vanished ones; confidence is unique 1..N", () => {
  const season = [game("a", 2, "2026-09-20T17:00Z"), game("b", 2, "2026-09-20T20:00Z"), game("c", 2, "2026-09-21T00:20Z")];
  const order = weekOrder(season, 2, ["c", "zzz", "a"]);
  assert.deepEqual(order, ["c", "a", "b"]);
  assert.deepEqual(order.map((id) => confidenceOf(order, id)), [3, 2, 1]);
  assert.deepEqual(moveInOrder(order, "b", 0), ["b", "c", "a"]);
  assert.deepEqual(moveInOrder(order, "c", 99), ["a", "b", "c"]);
});

test("scoring: confidence on hits, zero on misses and unpicked, upset bonus only for the dog", () => {
  const season = [
    finished("a", 2, "2026-09-20T17:00Z", "home", { spread: -3, favorite: "home" }),
    finished("b", 2, "2026-09-20T20:00Z", "away", { spread: -6.5, favorite: "home" }),
    finished("c", 2, "2026-09-21T00:20Z", "home"),
  ];
  const picks = { a: { side: "home" }, b: { side: "away" } };
  const order = ["a", "b", "c"];
  const plain = scoreWeek(season, 2, picks, order);
  assert.equal(plain.points, 3 + 2);
  assert.equal(plain.hits, 2);
  const withBonus = scoreWeek(season, 2, picks, order, { bonus: true });
  assert.equal(upsetBonus(season[1], "away"), 7);
  assert.equal(upsetBonus(season[0], "home"), 0);
  assert.equal(withBonus.points, 3 + 2 + 7);
  assert.equal(pickHit(season[2], null), false);
});

test("streak counts consecutive hits newest first", () => {
  const season = [finished("a", 1, "2026-09-13T17:00Z", "home"), finished("b", 1, "2026-09-13T20:00Z", "away"), finished("c", 2, "2026-09-20T17:00Z", "home")];
  assert.equal(streak(season, { a: { side: "away" }, b: { side: "away" }, c: { side: "home" } }), 2);
  assert.equal(streak(season, { a: { side: "home" }, b: { side: "away" }, c: { side: "away" } }), 0);
});

test("rival link round trip", () => {
  const hash = encodeRival(2, ["401872934", "401872932"], { 401872934: { side: "away" } }, "Angel");
  assert.deepEqual(decodeRival(`#${hash}`), { week: 2, name: "Angel", order: ["401872934", "401872932"], picks: { 401872934: { side: "away" } } });
  assert.equal(decodeRival("#nothing"), null);
});
