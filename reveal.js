// Reveal choreography and sound. Timings from Balatro's score reveal: ~300 ms per step, 60 to 80 ms hitstop, small shake.

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? Math.min(ms, 120) : ms));

export function hitstop(ms = 70) {
  return wait(ms);
}

export function shake(el) {
  if (reduced()) return;
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
  el.addEventListener("animationend", () => el.classList.remove("shake"), { once: true });
}

export function bump(el) {
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
  el.addEventListener("animationend", () => el.classList.remove("bump"), { once: true });
}

const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

export function rollNumber(el, to, duration = 450) {
  const from = Number(el.textContent) || 0;
  if (from === to || reduced()) {
    el.textContent = String(to);
    return Promise.resolve();
  }
  const start = performance.now();
  return new Promise((resolve) => {
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = String(Math.round(from + (to - from) * easeOutBack(t)));
      if (t < 1) requestAnimationFrame(step);
      else {
        el.textContent = String(to);
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

// Flip a card: squash to a line, swap its face at the midpoint, expand.
export async function flip(el, swapFace) {
  if (reduced()) {
    swapFace();
    return;
  }
  el.classList.add("flip");
  await wait(150);
  swapFace();
  await wait(150);
  el.classList.remove("flip");
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.on = true;
  }
  unlock() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.tone(880, 0.02, "sine", 0.02);
  }
  tone(freq, dur, type = "sine", gain = 0.08, when = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  tick() {
    this.tone(1400, 0.03, "square", 0.025);
  }
  pick() {
    this.tone(660, 0.06, "triangle", 0.06);
  }
  hit(i) {
    const scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77];
    this.tone(scale[i % scale.length], 0.18, "triangle", 0.09);
    this.tone(scale[i % scale.length] * 2, 0.1, "sine", 0.03, 0.02);
  }
  miss() {
    this.tone(150, 0.16, "square", 0.05);
    this.tone(110, 0.2, "sine", 0.05, 0.04);
  }
  bengals() {
    this.tone(82.41, 0.45, "sine", 0.16);
    this.tone(164.81, 0.3, "triangle", 0.08, 0.05);
  }
}
