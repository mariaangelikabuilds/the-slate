import * as S from "./season.js";
import { fetchWeekLive } from "./live.js";
import { Sound, flip, hitstop, shake, bump, rollNumber, wait } from "./reveal.js";

const STATE_KEY = "slate.v1";
const LIVE_KEY = "slate.live.v1";
const DEFAULT_NAME = "Banjo";
const BONUS = { bonus: true };
const name = () => state.name ?? DEFAULT_NAME;

const $ = (sel) => document.querySelector(sel);
const sound = new Sound();

let baked = [];
let season = [];
let state = loadState();
let view = { week: 1, wall: false, checkedAt: null };

function loadState() {
  try {
    return { picks: {}, orders: {}, revealed: {}, rivals: {}, audio: true, ...JSON.parse(localStorage.getItem(STATE_KEY) ?? "{}") };
  } catch {
    return { picks: {}, orders: {}, revealed: {}, rivals: {}, audio: true };
  }
}
function setState(patch) {
  state = { ...state, ...patch };
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
}
function loadLive() {
  try { return JSON.parse(localStorage.getItem(LIVE_KEY) ?? "[]"); } catch { return []; }
}
function saveLive(games) {
  const prior = loadLive().filter((g) => !games.some((n) => n.id === g.id));
  try { localStorage.setItem(LIVE_KEY, JSON.stringify([...prior, ...games])); } catch {}
}

const inkFor = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 150 ? "#000000" : "#f6f1ea";
};
const isMine = (g) => g.home.abbr === S.MY_TEAM || g.away.abbr === S.MY_TEAM;
const orderFor = (week) => S.weekOrder(season, week, state.orders[week]);
const weeks = () => [...new Set(baked.map((g) => g.week))].sort((a, b) => a - b);

async function refreshLive(week) {
  const now = Date.now();
  const stale = (w) => S.gamesInWeek(season, w).some((g) => !g.final && S.kickoffMs(g) - now < 7 * 86400e3);
  const targets = [week, week - 1].filter((w) => w >= 1 && stale(w));
  for (const w of targets) {
    const live = await fetchWeekLive(w).catch(() => null);
    if (!live) continue;
    season = S.mergeLive(season, live);
    saveLive(live.filter((g) => g.final || g.state !== "pre" || g.timeValid));
    view = { ...view, checkedAt: new Date() };
  }
}

function lineText(g) {
  if (g.state === "in") return `${g.away.score} : ${g.home.score}`;
  if (g.final) return `${g.away.score} : ${g.home.score}`;
  if (g.spread == null || !g.favorite) return "no line";
  const fav = g.favorite === "home" ? g.home.abbr : g.away.abbr;
  return `${fav} by ${Math.abs(g.spread)}`;
}

function fillCard(el, g, order, now) {
  const pick = state.picks[g.id]?.side ?? null;
  const locked = S.isLocked(g, now);
  const revealed = Boolean(state.revealed[g.id]);
  el.dataset.id = g.id;
  el.className = "card";
  el.classList.toggle("mine", isMine(g));
  el.classList.toggle("picked", Boolean(pick));
  el.classList.toggle("unpicked", !pick);
  el.classList.toggle("locked", locked);
  el.classList.toggle("live", g.state === "in");
  el.classList.toggle("facedown", g.final && !revealed);
  el.classList.toggle("revealed", g.final && revealed);
  if (g.final && revealed) {
    const hit = S.pickHit(g, pick);
    el.classList.toggle("hit", hit);
    el.classList.toggle("miss", Boolean(pick) && !hit);
  }
  el.querySelector(".conf-num").textContent = S.confidenceOf(order, g.id);
  for (const side of ["away", "home"]) {
    const btn = el.querySelector(`.side-${side}`);
    const t = g[side];
    btn.style.background = t.color;
    btn.style.color = inkFor(t.color);
    btn.querySelector(".abbr").textContent = t.abbr;
    btn.querySelector(".rec").textContent = g.final || g.state === "in" ? t.score : t.record ?? "";
    btn.classList.toggle("on", pick === side);
    btn.classList.toggle("won", g.final && S.winnerSide(g) === side);
    btn.setAttribute("aria-pressed", String(pick === side));
    btn.setAttribute("aria-label", `${t.name}${pick === side ? ", your pick" : ""}`);
  }
  el.querySelector(".line").textContent = lineText(g);
  const rival = state.rivals?.[g.week];
  const rivalSide = rival?.picks[g.id]?.side;
  el.querySelector(".rival").textContent = rival ? `${rival.name}: ${rivalSide ? g[rivalSide].abbr : "no call"}` : "";
  el.querySelector(".rival").hidden = !rival;
  el.querySelector(".when").textContent = g.final ? "Final" : g.state === "in" ? g.clock ?? "Live" : locked ? "Locked" : S.kickoffLabel(g);
  if (g.final && revealed) {
    const pts = S.scoreWeek(season, g.week, state.picks, order, BONUS).rows.find((r) => r.id === g.id)?.points ?? 0;
    el.querySelector(".conf-num").textContent = pick ? (S.pickHit(g, pick) ? `+${pts}` : "0") : "–";
  }
}

function renderStack() {
  const now = Date.now();
  const order = orderFor(view.week);
  const games = S.gamesInWeek(season, view.week);
  const stack = $("#stack");
  const tpl = $("#card-tpl");
  const frag = document.createDocumentFragment();
  for (const id of order) {
    const g = games.find((x) => x.id === id);
    const el = tpl.content.firstElementChild.cloneNode(true);
    fillCard(el, g, order, now);
    frag.appendChild(el);
  }
  stack.replaceChildren(frag);
}

function renderBug() {
  const order = orderFor(view.week);
  const wk = S.scoreWeek(season, view.week, state.picks, order, BONUS);
  $("#bug-week").textContent = view.week;
  $("#bug-points").textContent = wk.points;
  $("#bug-streak").textContent = S.streak(season, state.picks);
  $("#bug-season").textContent = S.seasonPoints(season, state.picks, state.orders, BONUS);
  const ws = weeks();
  $("#prev").disabled = view.week <= ws[0];
  $("#next").disabled = view.week >= ws[ws.length - 1];
}

function renderTools() {
  const games = S.gamesInWeek(season, view.week);
  const unrevealed = games.filter((g) => g.final && !state.revealed[g.id]);
  const allDone = games.length > 0 && games.every((g) => g.final && state.revealed[g.id]);
  const open = games.filter((g) => !S.isLocked(g, Date.now()));
  $("#reveal").hidden = unrevealed.length === 0;
  $("#reveal").textContent = unrevealed.length === games.length ? "Reveal the week" : `Reveal ${unrevealed.length}`;
  $("#wall-toggle").hidden = !allDone;
  $("#wall-toggle").textContent = view.wall ? "Cards" : "Wall";
  const unpicked = open.filter((g) => !state.picks[g.id]).length;
  $("#week-note").textContent = allDone
    ? `Week ${view.week} is in the books.`
    : open.length === 0
      ? "Every game this week has kicked off."
      : unpicked > 0
        ? `${unpicked} of ${open.length} open ${open.length === 1 ? "game" : "games"} still uncalled. Kickoffs in Perth time.`
        : "All called. Drag the handle to rank them. Top of the stack is worth the most.";
  const called = games.filter((g) => state.picks[g.id]).length;
  $("#share").hidden = called === 0;
  $("#share").textContent = `Send my ${called} ${called === 1 ? "call" : "calls"}`;
  $("#audio").textContent = state.audio ? "Sound on" : "Sound off";
  $("#audio").setAttribute("aria-pressed", String(state.audio));
  $("#fetched").textContent = view.checkedAt ? `Scores from ESPN. Last checked ${S.fmtPerthTime(view.checkedAt.toISOString())} Perth.` : "Scores from ESPN. Using the last saved copy.";
}

function renderWall() {
  const order = orderFor(view.week);
  const games = S.gamesInWeek(season, view.week);
  const wk = S.scoreWeek(season, view.week, state.picks, order, BONUS);
  const tiles = wk.rows
    .map((r) => {
      const g = games.find((x) => x.id === r.id);
      const abbr = r.side ? g[r.side].abbr : "—";
      const cls = r.hit ? "hit" : r.side ? "miss" : "";
      return `<div class="tile ${cls} ${isMine(g) ? "mine" : ""}"><span class="abbr">${abbr}</span><span class="pts">${r.hit ? `+${r.points}` : r.side ? `${r.conf}` : "no pick"}</span></div>`;
    })
    .join("");
  const rival = state.rivals?.[view.week];
  const rivalScore = rival ? S.scoreWeek(season, view.week, rival.picks, S.weekOrder(season, view.week, rival.order), BONUS) : null;
  $("#wall").innerHTML = `
    <div class="wall-head"><h2>${wk.hits} of ${wk.rows.length}</h2><p>${name()}, week ${view.week}, ${wk.points} points${rivalScore ? `<br>${rival.name}: ${rivalScore.hits} of ${rivalScore.rows.length}, ${rivalScore.points} points` : ""}</p></div>
    <div class="wall-grid">${tiles}</div>
    <p class="wall-foot">Screenshot this one.</p>`;
}

function renderStrip() {
  const ws = weeks();
  const per = ws.map((w) => S.scoreWeek(season, w, state.picks, orderFor(w), BONUS));
  const max = Math.max(1, ...per.map((p) => p.points));
  const now = S.currentWeek(season, Date.now());
  $("#strip").innerHTML = ws
    .map((w, i) => {
      const h = Math.max(3, Math.round((per[i].points / max) * 46));
      const cls = ["wk", per[i].points > 0 ? "scored" : "", w === now ? "now" : ""].join(" ");
      return `<button class="${cls}" role="tab" aria-selected="${w === view.week}" data-week="${w}" aria-label="Week ${w}, ${per[i].points} points"><span class="bar" style="height:${h}px"></span><span class="n">${w}</span></button>`;
    })
    .join("");
}

function render() {
  renderBug();
  renderTools();
  $("#stack").hidden = view.wall;
  $("#wall").hidden = !view.wall;
  if (view.wall) renderWall();
  else renderStack();
  renderStrip();
}

async function showWeek(week) {
  const games = S.gamesInWeek(season, week);
  const allDone = games.length > 0 && games.every((g) => g.final && state.revealed[g.id]);
  view = { ...view, week, wall: allDone };
  render();
  await refreshLive(week);
  render();
}

function onPick(id, side) {
  const g = season.find((x) => x.id === id);
  if (!g || S.isLocked(g, Date.now())) return;
  const current = state.picks[id]?.side;
  const { [id]: _drop, ...rest } = state.picks;
  setState({ picks: current === side ? rest : { ...rest, [id]: { side } } });
  sound.pick();
  render();
}

// Drag on the handle: the card follows the pointer, the others step aside, release commits the new order.
function startDrag(ev, cardEl) {
  const g = season.find((x) => x.id === cardEl.dataset.id);
  if (!g || S.isLocked(g, Date.now())) return;
  ev.preventDefault();
  const stack = $("#stack");
  const cards = [...stack.children];
  const rects = cards.map((c) => c.getBoundingClientRect());
  const from = cards.indexOf(cardEl);
  const startY = ev.clientY;
  let to = from;
  cardEl.classList.add("dragging");
  cardEl.setPointerCapture(ev.pointerId);
  const height = rects[from].height + 10;
  const onMove = (e) => {
    const dy = e.clientY - startY;
    cardEl.style.transform = `translateY(${dy}px) scale(1.02)`;
    const centre = rects[from].top + rects[from].height / 2 + dy;
    let target = from;
    cards.forEach((c, i) => {
      if (i === from) return;
      const mid = rects[i].top + rects[i].height / 2;
      if (i < from && centre < mid) target = Math.min(target, i);
      if (i > from && centre > mid) target = Math.max(target, i);
    });
    if (target !== to) {
      to = target;
      sound.tick();
    }
    cards.forEach((c, i) => {
      if (i === from) return;
      c.classList.add("shifting");
      const shift = i > from && i <= to ? -height : i < from && i >= to ? height : 0;
      c.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  };
  const onUp = () => {
    cardEl.removeEventListener("pointermove", onMove);
    cardEl.removeEventListener("pointerup", onUp);
    cardEl.removeEventListener("pointercancel", onUp);
    cards.forEach((c) => { c.classList.remove("shifting"); c.style.transform = ""; });
    cardEl.classList.remove("dragging");
    if (to !== from) setState({ orders: { ...state.orders, [view.week]: S.moveInOrder(orderFor(view.week), g.id, to) } });
    render();
  };
  cardEl.addEventListener("pointermove", onMove);
  cardEl.addEventListener("pointerup", onUp);
  cardEl.addEventListener("pointercancel", onUp);
}

function nudge(cardEl, dir) {
  const order = orderFor(view.week);
  const i = order.indexOf(cardEl.dataset.id);
  setState({ orders: { ...state.orders, [view.week]: S.moveInOrder(order, cardEl.dataset.id, i + dir) } });
  render();
  $(`.card[data-id="${cardEl.dataset.id}"] .handle`)?.focus();
}

async function revealWeek() {
  const btn = $("#reveal");
  btn.disabled = true;
  const order = orderFor(view.week);
  const games = S.gamesInWeek(season, view.week);
  const bugPoints = $("#bug-points");
  let hits = 0;
  for (const id of order) {
    const g = games.find((x) => x.id === id);
    if (!g.final || state.revealed[id]) continue;
    const el = $(`.card[data-id="${id}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    setState({ revealed: { ...state.revealed, [id]: true } });
    const pick = state.picks[id]?.side;
    const hit = S.pickHit(g, pick);
    await flip(el, () => fillCard(el, g, order, Date.now()));
    if (hit) {
      hits += 1;
      await hitstop(70);
      sound.hit(hits - 1);
      const total = S.scoreWeek(season, view.week, state.picks, order, BONUS).points;
      bump(bugPoints);
      rollNumber(bugPoints, total, 420);
      if (isMine(g)) { shake($("#bug")); sound.bengals(); }
    } else if (pick) {
      sound.miss();
    }
    await wait(300);
  }
  $("#bug-streak").textContent = S.streak(season, state.picks);
  $("#bug-season").textContent = S.seasonPoints(season, state.picks, state.orders, BONUS);
  btn.disabled = false;
  await wait(500);
  const allDone = games.every((g) => g.final && state.revealed[g.id]);
  view = { ...view, wall: allDone };
  render();
}

async function shareWeek() {
  const order = orderFor(view.week);
  const url = `${location.origin}${location.pathname}#${S.encodeRival(view.week, order, state.picks, name())}`;
  const text = `${name()}'s week ${view.week} calls on The Slate`;
  if (navigator.share) {
    await navigator.share({ title: "The Slate", text, url }).catch(() => {});
    return;
  }
  await navigator.clipboard?.writeText(url).catch(() => {});
  $("#share").textContent = "Link copied";
  setTimeout(() => renderTools(), 1600);
}

function importRival() {
  const rival = S.decodeRival(location.hash);
  const me = new URLSearchParams(location.search).get("me");
  if (me) setState({ name: me.slice(0, 24) });
  if (rival && rival.name !== name()) setState({ rivals: { ...(state.rivals ?? {}), [rival.week]: rival } });
  if (rival || me) history.replaceState(null, "", location.pathname);
  return rival;
}

function wire() {
  $("#share").addEventListener("click", shareWeek);
  $("#start").addEventListener("click", async () => {
    sound.on = state.audio;
    sound.unlock();
    $("#title").hidden = true;
    $("#app").hidden = false;
    await showWeek(view.week);
  });
  $("#prev").addEventListener("click", () => showWeek(view.week - 1));
  $("#next").addEventListener("click", () => showWeek(view.week + 1));
  $("#reveal").addEventListener("click", revealWeek);
  $("#wall-toggle").addEventListener("click", () => { view = { ...view, wall: !view.wall }; render(); });
  $("#audio").addEventListener("click", () => { setState({ audio: !state.audio }); sound.on = state.audio; if (state.audio) sound.unlock(); renderTools(); });
  $("#strip").addEventListener("click", (e) => { const b = e.target.closest("[data-week]"); if (b) showWeek(Number(b.dataset.week)); });
  $("#stack").addEventListener("click", (e) => {
    const side = e.target.closest(".side");
    if (side) onPick(side.closest(".card").dataset.id, side.classList.contains("side-home") ? "home" : "away");
  });
  $("#stack").addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(".handle");
    if (handle) startDrag(e, handle.closest(".card"));
  });
  $("#stack").addEventListener("keydown", (e) => {
    const handle = e.target.closest(".handle");
    if (!handle) return;
    if (e.key === "ArrowUp") { e.preventDefault(); nudge(handle.closest(".card"), -1); }
    if (e.key === "ArrowDown") { e.preventDefault(); nudge(handle.closest(".card"), 1); }
  });
}

// Games that kicked off before Banjo first opened the app were never his to call. They show their result quietly; the reveal ritual starts from here.
function settleHistory() {
  const installedAt = state.installedAt ?? new Date().toISOString();
  const before = season.filter((g) => g.final && !state.revealed[g.id] && !state.picks[g.id] && S.kickoffMs(g) < Date.parse(installedAt));
  if (!state.installedAt || before.length) {
    setState({ installedAt, revealed: { ...state.revealed, ...Object.fromEntries(before.map((g) => [g.id, true])) } });
  }
}

async function boot() {
  const res = await fetch("/data/season-2026.json");
  baked = (await res.json()).games;
  season = S.mergeLive(baked, loadLive());
  settleHistory();
  const rival = importRival();
  view = { ...view, week: rival?.week ?? S.currentWeek(season, Date.now()) };
  $("#title-name").textContent = name();
  $("#title-sub").textContent = `Week ${view.week} of the 2026 season`;
  $("#title").hidden = false;
  wire();
}

boot();
