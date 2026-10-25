export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (str) => String(str ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const round = (n, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

export function stdDev(arr) {
  if (!arr.length) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}

// Maps a coefficient of variation to a 0-100 "consistency" score.
export function kogasa(cov) {
  return 100 * (1 - Math.tanh(cov + cov ** 3 / 3 + cov ** 5 / 5));
}

export const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// 3725 -> "01:02:05"
export function formatDuration(seconds) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [h, m, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

export function formatDate(date, withTime = true) {
  const d = new Date(date);
  const day = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  if (!withTime) return day;
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Fades an element out/in via the .faded class (opacity transition in CSS).
export async function fade(el, show, ms = 125) {
  if (show) {
    el.classList.remove("hidden");
    el.classList.add("faded");
    void el.offsetWidth;
    el.classList.remove("faded");
  } else {
    el.classList.add("faded");
  }
  await sleep(ms);
  if (!show) {
    el.classList.add("hidden");
    el.classList.remove("faded");
  }
}
