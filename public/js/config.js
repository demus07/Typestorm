import { debounce } from "./utils.js";
import { api } from "./api.js";
import { auth } from "./auth.js";

const STORAGE_KEY = "typestorm-config";

export const DEFAULTS = Object.freeze({
  // test
  mode: "time",
  time: 30,
  words: 50,
  quoteLength: "medium",
  punctuation: false,
  numbers: false,
  language: "english",
  customText: "The quick brown fox jumps over the lazy dog",
  customTextShuffle: false,
  customTextLimit: 0,
  // behavior
  difficulty: "normal",
  quickRestart: "off",
  blindMode: false,
  // input
  freedomMode: false,
  strictSpace: false,
  confidenceMode: "off",
  stopOnError: "off",
  indicateTypos: "off",
  // sound
  soundVolume: 0.5,
  playSoundOnClick: "off",
  playSoundOnError: "off",
  // caret
  caretStyle: "default",
  smoothCaret: true,
  paceCaret: "off",
  paceCaretCustomSpeed: 100,
  // appearance
  timerStyle: "mini",
  liveWpm: false,
  liveAcc: false,
  smoothLineScroll: true,
  fontSize: 2,
  fontFamily: "Newsreader",
  keymapMode: "off",
  // theme
  theme: "storm",
  // hide elements
  showKeyTips: true,
  showOutOfFocusWarning: true,
  capsLockWarning: true,
});

export const config = { ...DEFAULTS };
const listeners = new Set();

function sanitize(raw) {
  const out = { ...DEFAULTS };
  if (raw && typeof raw === "object") {
    for (const key of Object.keys(DEFAULTS)) {
      if (key in raw && typeof raw[key] === typeof DEFAULTS[key]) out[key] = raw[key];
    }
  }
  return out;
}

function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

let remotePending = false;
const pushRemote = debounce(() => {
  remotePending = false;
  if (auth.user) api.put("/api/config", { config }).catch(() => {});
}, 1000);
const saveRemote = () => {
  remotePending = true;
  pushRemote();
};

// Don't lose a change made less than a second before the page is left or reloaded.
window.addEventListener("pagehide", () => {
  if (!remotePending || !auth.user) return;
  remotePending = false;
  fetch("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {});
});

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setConfig(key, value, { save = true } = {}) {
  if (!(key in DEFAULTS)) return;
  config[key] = value;
  if (save) {
    saveLocal();
    saveRemote();
  }
  listeners.forEach((fn) => fn(key, value));
}

// Replaces the whole config (import, reset, account sync) and notifies every key.
export function applyConfig(raw, { save = true } = {}) {
  Object.assign(config, sanitize(raw));
  if (save) {
    saveLocal();
    saveRemote();
  }
  for (const key of Object.keys(DEFAULTS)) listeners.forEach((fn) => fn(key, config[key]));
}

export function loadLocalConfig() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {}
  Object.assign(config, sanitize(raw));
}

// Signed-in users get their config from the server; a fresh account inherits local settings.
export async function syncAccountConfig() {
  if (!auth.user) return;
  try {
    const { config: remote } = await api.get("/api/config");
    if (remote) applyConfig(remote, { save: false }), saveLocal();
    else saveRemote();
  } catch {}
}
