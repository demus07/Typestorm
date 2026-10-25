import { config, setConfig, subscribe } from "./config.js";
import { $, $$, esc, round, mean, stdDev, kogasa, shuffle, sleep, debounce } from "./utils.js";
import { getWordList, WordGenerator, languageDisplay } from "./words.js";
import { randomQuote } from "./quotes.js";
import { playClick, playError } from "./sound.js";
import { showResult, hideResult, isResultVisible } from "./results.js";
import { openCustomAmountModal, openCustomTextModal } from "./modals.js";
import { openCommandLine } from "./commandline.js";
import { getLocalPb, getLastWpm, recordLocalResult } from "./localstats.js";
import { renderKeymap, keymapPress, keymapNext } from "./keymap.js";
import { DEFAULT_FONT } from "./fonts.js";

const els = {};

// ---- test state ----
let settings = null; // snapshot of the config the current test was started with
let words = []; // target words
let wordEls = [];
let history = []; // committed input per word
let input = ""; // current word input
let wordIndex = 0;
let active = false;
let finished = false;
let startTime = 0;
let timerHandle = null;
let generator = null;
let keys = { correct: 0, incorrect: 0 };
let bucket = { keys: 0, errors: 0 }; // keypresses within the current second
let chart = { wpm: [], raw: [], err: [] };
let replay = [];
let errorWordIndexes = new Set();
let repeated = false;
let practiceWords = null;
let lineHeight = 0;
let lineOffset = 0;
let restartId = 0;
let blinkTimeout = null;
let focusWarningTimeout = null;
let sessionSeconds = 0;
let pace = null; // { cps, handle } while the pace caret runs
let restarting = false; // input is ignored while a restart is in flight
const incomplete = { tests: 0, seconds: 0 };

const RESTART_KEYS = new Set([
  "difficulty", "mode", "time", "words", "quoteLength", "punctuation", "numbers", "language",
  "customText", "customTextShuffle", "customTextLimit",
]);

export const isActive = () => active;
export const isTestPageVisible = () => !els.page.classList.contains("hidden");

export function consumeIncomplete() {
  const out = { ...incomplete };
  incomplete.tests = 0;
  incomplete.seconds = 0;
  return out;
}

// ---------- word set ----------

function snapshotSettings() {
  const s = {
    mode: practiceWords ? "custom" : config.mode,
    punctuation: config.punctuation,
    numbers: config.numbers,
    language: config.language,
    difficulty: config.difficulty,
    blind: config.blindMode,
    practice: !!practiceWords,
  };
  if (!["time", "words"].includes(s.mode)) s.punctuation = s.numbers = false;
  s.timeLimit = s.mode === "time" ? config.time : 0;
  s.mode2 = { time: String(config.time), words: String(config.words), zen: "zen", custom: "custom" }[s.mode] ?? "";
  return s;
}

async function buildWords(s) {
  if (s.mode === "zen") return [""];
  if (s.practice) return [...practiceWords];
  if (s.mode === "quote") {
    const quote = randomQuote(config.quoteLength);
    s.quote = quote;
    s.mode2 = String(quote.id);
    s.quoteLength = quote.length;
    return quote.text.split(/\s+/);
  }
  if (s.mode === "custom") {
    let list = config.customText.trim().split(/\s+/).filter(Boolean);
    if (!list.length) list = ["empty"];
    if (config.customTextLimit > 0) {
      const out = [];
      while (out.length < config.customTextLimit) out.push(...shuffle(list));
      return out.slice(0, config.customTextLimit);
    }
    return config.customTextShuffle ? shuffle(list) : list;
  }
  const list = await getWordList(s.language);
  generator = new WordGenerator(list, { punctuation: s.punctuation, numbers: s.numbers });
  if (s.mode === "words") {
    const out = generator.generate(Math.max(0, config.words - 1));
    out.push(generator.next(true));
    return out;
  }
  return generator.generate(100);
}

// ---------- rendering ----------

function letterMarkup(target, typed, blind) {
  let html = "";
  for (let j = 0; j < target.length; j++) {
    const t = typed[j];
    let cls = "";
    let ch = target[j];
    let hint = "";
    if (t !== undefined) {
      cls = t === ch || blind ? "correct" : "incorrect";
      if (cls === "incorrect" && config.indicateTypos === "replace") ch = t;
      if (cls === "incorrect" && config.indicateTypos === "below") hint = `<hint>${esc(t)}</hint>`;
    }
    html += `<letter${cls ? ` class="${cls}"` : ""}>${esc(ch)}${hint}</letter>`;
  }
  if (!blind) {
    for (let j = target.length; j < typed.length; j++) html += `<letter class="incorrect extra">${esc(typed[j])}</letter>`;
  }
  return html;
}

function renderWord(i) {
  const el = wordEls[i];
  if (!el) return;
  const typed = i === wordIndex ? input : history[i] ?? "";
  const target = settings.mode === "zen" ? typed : words[i];
  const committed = i < wordIndex;
  el.innerHTML = letterMarkup(target, typed, settings.blind);
  el.classList.toggle("error", committed && !settings.blind && typed !== target);
  el.classList.toggle("active", i === wordIndex);
  el.classList.toggle("typed", committed);
}

function appendWordEls() {
  const frag = document.createDocumentFragment();
  for (let i = wordEls.length; i < words.length; i++) {
    const el = document.createElement("div");
    el.className = "word";
    el.innerHTML = letterMarkup(words[i], "", false);
    wordEls.push(el);
    frag.append(el);
  }
  els.words.append(frag);
}

function renderAll() {
  els.words.innerHTML = "";
  els.words.append(els.caret, els.paceCaret);
  wordEls = [];
  appendWordEls();
  renderWord(0);
  lineOffset = 0;
  els.words.style.transition = "none";
  els.words.style.transform = "translateY(0)";
  measure();
  updateCaret(true);
  updateProgressDisplays();
  requestAnimationFrame(() => (els.words.style.transition = ""));
}

function measure() {
  const w = wordEls[0];
  if (!w) return;
  const cs = getComputedStyle(w);
  lineHeight = w.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
  els.wordsWrapper.style.height = `${lineHeight * 3}px`;
}

function updateCaret(instant = false) {
  const caret = els.caret;
  caret.className = `${config.caretStyle}${config.smoothCaret && !instant ? " smooth" : ""}`;
  if (config.caretStyle === "off" || finished) return caret.classList.add("hidden");
  const el = wordEls[wordIndex];
  if (!el) return;
  const letters = el.getElementsByTagName("letter");
  let x, y, w, h;
  if (!letters.length) {
    x = el.offsetLeft;
    y = el.offsetTop;
    h = el.offsetHeight;
    w = parseFloat(getComputedStyle(els.words).fontSize) * 0.6;
  } else {
    const atEnd = input.length >= letters.length;
    const l = letters[Math.min(input.length, letters.length - 1)];
    x = l.offsetLeft + (atEnd ? l.offsetWidth : 0);
    y = l.offsetTop;
    w = l.offsetWidth;
    h = l.offsetHeight;
  }
  caret.style.left = `${x}px`;
  caret.style.top = `${config.caretStyle === "underline" ? y + h : y + h / 2}px`;
  caret.style.width = config.caretStyle === "default" ? "" : `${w}px`;
  if (!active) caret.classList.add("blink");
}

function stopCaretBlink() {
  els.caret.classList.remove("blink");
  clearTimeout(blinkTimeout);
  blinkTimeout = setTimeout(() => els.caret.classList.add("blink"), 1000);
}

function updateLineScroll() {
  const el = wordEls[wordIndex];
  if (!el || !lineHeight) return;
  const line = Math.round((el.offsetTop - wordEls[0].offsetTop) / lineHeight);
  const target = Math.max(0, line - 1) * lineHeight;
  if (target === lineOffset) return;
  lineOffset = target;
  els.words.style.transition = config.smoothLineScroll ? "" : "none";
  els.words.style.transform = `translateY(${-target}px)`;
}

const nextChar = () => {
  if (!settings || finished || settings.mode === "zen") return null;
  const target = words[wordIndex] ?? "";
  return input.length < target.length ? target[input.length] : " ";
};

const refresh = () => {
  renderWord(wordIndex);
  updateCaret();
  updateLineScroll();
  keymapNext(nextChar());
};

// ---------- stats ----------

function countChars() {
  let correctWordChars = 0, correctChars = 0, incorrectChars = 0, extraChars = 0, missedChars = 0;
  let spaces = 0, correctSpaces = 0;
  const inputs = input ? [...history, input] : history;
  inputs.forEach((typed, i) => {
    const isCurrent = !!input && i === inputs.length - 1;
    const target = settings.mode === "zen" ? typed : words[i];
    if (target === undefined) return;
    if (typed === target) {
      correctWordChars += target.length;
      correctChars += target.length;
    } else {
      for (let j = 0; j < Math.max(typed.length, target.length); j++) {
        if (j >= target.length) extraChars++;
        else if (j >= typed.length) missedChars += isCurrent ? 0 : 1;
        else if (typed[j] === target[j]) correctChars++;
        else incorrectChars++;
      }
      if (isCurrent && target.startsWith(typed)) correctWordChars += typed.length;
    }
    if (!isCurrent) {
      spaces++;
      if (typed === target) correctSpaces++;
    }
  });
  return {
    wpmChars: correctWordChars + correctSpaces,
    rawChars: correctChars + incorrectChars + extraChars + spaces,
    charStats: [correctChars + correctSpaces, incorrectChars + (spaces - correctSpaces), extraChars, missedChars],
  };
}

const elapsedSeconds = () => (performance.now() - startTime) / 1000;
const accuracy = () => {
  const total = keys.correct + keys.incorrect;
  return total ? (keys.correct / total) * 100 : 100;
};

function recordSecond(sec) {
  const c = countChars();
  chart.wpm.push(round((c.wpmChars * 12) / sec));
  chart.raw.push(round(bucket.keys * 12));
  chart.err.push(bucket.errors);
  bucket = { keys: 0, errors: 0 };
}

function updateProgressDisplays(sec = active ? Math.floor(elapsedSeconds()) : 0) {
  if (!settings) return;
  let text;
  if (settings.mode === "time") text = String(Math.max(0, settings.timeLimit - sec));
  else if (settings.mode === "zen") text = String(sec);
  else text = `${Math.min(wordIndex, words.length)}/${words.length}`;
  els.miniTimer.textContent = text;
  els.textTimer.textContent = text;
  if (settings.mode !== "time" && settings.mode !== "zen") {
    els.barTimerFill.style.transition = "width .125s";
    els.barTimerFill.style.width = `${(wordIndex / words.length) * 100}%`;
  }
}

function updateLiveStats() {
  if (!active) return;
  const secs = Math.max(elapsedSeconds(), 1);
  els.miniWpm.textContent = Math.round((countChars().wpmChars * 12) / secs);
  els.miniAcc.textContent = `${Math.floor(accuracy())}%`;
}

function updateLiveVisibility() {
  const on = active;
  els.miniTimer.classList.toggle("hidden", !on || config.timerStyle !== "mini");
  els.textTimer.classList.toggle("hidden", !on || config.timerStyle !== "text");
  els.barTimer.classList.toggle("hidden", !on || config.timerStyle !== "bar" || settings?.mode === "zen");
  els.miniWpm.classList.toggle("hidden", !on || !config.liveWpm);
  els.miniAcc.classList.toggle("hidden", !on || !config.liveAcc);
}

// ---------- pace caret ----------

function paceSpeed() {
  if (!settings || settings.mode === "zen") return null;
  if (config.paceCaret === "custom") return config.paceCaretCustomSpeed;
  if (config.paceCaret === "pb") return getLocalPb(settings);
  if (config.paceCaret === "last") return getLastWpm();
  return null;
}

function stopPace() {
  if (pace) clearTimeout(pace.handle);
  pace = null;
  els.paceCaret.classList.add("hidden");
}

function startPace() {
  stopPace();
  const wpm = paceSpeed();
  if (!wpm || wpm <= 0) return;
  pace = { cps: (wpm * 5) / 60 };
  els.paceCaret.className = config.caretStyle === "off" ? "default" : config.caretStyle;
  paceTick();
}

function paceTick() {
  if (!pace || !active) return;
  let remaining = elapsedSeconds() * pace.cps;
  let wi = 0;
  while (wi < words.length && remaining >= words[wi].length + 1) {
    remaining -= words[wi].length + 1;
    wi++;
  }
  const el = wordEls[wi];
  if (!el) return stopPace();
  const letters = el.getElementsByTagName("letter");
  const idx = Math.floor(remaining);
  const l = letters[Math.min(idx, letters.length - 1)];
  if (l) {
    const x = l.offsetLeft + (idx >= letters.length ? l.offsetWidth : 0);
    els.paceCaret.style.left = `${x}px`;
    els.paceCaret.style.top = `${config.caretStyle === "underline" ? l.offsetTop + l.offsetHeight : l.offsetTop + l.offsetHeight / 2}px`;
    if (config.caretStyle !== "default") els.paceCaret.style.width = `${l.offsetWidth}px`;
    els.paceCaret.classList.remove("hidden");
  }
  pace.handle = setTimeout(paceTick, 50);
}

// ---------- test flow ----------

function startTest() {
  active = true;
  startTime = performance.now();
  document.body.classList.add("focus");
  els.page.classList.add("active");
  updateProgressDisplays(0);
  updateLiveVisibility();
  updateLiveStats();
  startPace();
  if (settings.mode === "time") {
    const fill = els.barTimerFill;
    fill.style.transition = "none";
    fill.style.width = "100%";
    void fill.offsetWidth;
    fill.style.transition = `width ${settings.timeLimit}s linear`;
    fill.style.width = "0%";
  }
  const tick = () => {
    const sec = Math.round(elapsedSeconds());
    recordSecond(sec);
    if (settings.mode === "time" && sec >= settings.timeLimit) return finish();
    updateProgressDisplays(sec);
    updateLiveStats();
    timerHandle = setTimeout(tick, startTime + (sec + 1) * 1000 - performance.now());
  };
  timerHandle = setTimeout(tick, 1000);
}

function registerKey(correct, ch) {
  keymapPress(ch, correct);
  keys[correct ? "correct" : "incorrect"]++;
  bucket.keys++;
  if (!correct) {
    bucket.errors++;
    errorWordIndexes.add(wordIndex);
  }
  if (!correct && config.playSoundOnError !== "off") playError();
  else playClick();
  if (config.liveAcc) els.miniAcc.textContent = `${Math.floor(accuracy())}%`;
  if (!correct && settings.difficulty === "master") {
    setTimeout(() => finish("master"));
    return false;
  }
  return true;
}

const recordReplay = () => replay.push({ t: performance.now() - startTime, w: wordIndex, i: input });

function commitWord() {
  history[wordIndex] = input;
  if (settings.mode === "zen") words[wordIndex] = input;
  const prev = wordIndex++;
  input = "";
  renderWord(prev);
  if (settings.mode === "zen") {
    words.push("");
    appendWordEls();
  } else if (settings.mode === "time" && words.length - wordIndex < 50) {
    words.push(...generator.generate(50));
    appendWordEls();
  }
  recordReplay();
  if (wordIndex >= words.length) return finish();
  refresh();
  updateProgressDisplays();
}

function onChar(ch) {
  if (finished || restarting) return;
  if (!active) {
    if (ch === " " && !config.strictSpace) return;
    startTest();
  }
  stopCaretBlink();

  if (settings.mode === "zen") {
    if (ch === " ") {
      if (!input) return;
      registerKey(true, ch);
      return commitWord();
    }
    registerKey(true, ch);
    input += ch;
    words[wordIndex] = input;
    recordReplay();
    return refresh();
  }

  const target = words[wordIndex];
  if (ch === " " && (input.length > 0 || !config.strictSpace)) {
    if (!input) return;
    const correct = input === target;
    if (!correct && config.stopOnError === "word") return registerKey(false, ch);
    if (!registerKey(correct, ch)) return;
    if (!correct && settings.difficulty === "expert") {
      history[wordIndex++] = input;
      input = "";
      return finish("expert");
    }
    return commitWord();
  }

  if (input.length >= target.length + 20) return;
  const correct = ch === target[input.length];
  if (!correct && config.stopOnError === "letter") return registerKey(false, ch);
  const ok = registerKey(correct, ch);
  input += ch;
  recordReplay();
  refresh();
  if (!ok) return;
  if (wordIndex === words.length - 1 && input === target && settings.mode !== "time") finish();
}

function onBackspace(wholeWord) {
  if (finished || restarting || !settings) return;
  if (config.confidenceMode === "max") return;
  if (!active && wordIndex === 0 && !input) return;
  stopCaretBlink();
  if (!input) {
    if (wordIndex === 0 || config.confidenceMode === "on") return;
    const prevTyped = history[wordIndex - 1];
    if (settings.mode !== "zen" && prevTyped === words[wordIndex - 1] && !config.freedomMode) return;
    if (settings.mode === "zen") {
      words.pop();
      wordEls.pop().remove();
    }
    wordIndex--;
    history.length = wordIndex;
    input = wholeWord ? "" : prevTyped;
    renderWord(wordIndex + 1);
  } else {
    input = wholeWord ? "" : input.slice(0, -1);
  }
  if (settings.mode === "zen") words[wordIndex] = input;
  recordReplay();
  refresh();
  updateProgressDisplays();
}

function finish(failReason = null) {
  if (finished || !active) return;
  const end = performance.now();
  clearTimeout(timerHandle);
  active = false;
  finished = true;
  stopPace();
  document.body.classList.remove("focus");
  els.page.classList.remove("active");
  updateLiveVisibility();

  let seconds = (end - startTime) / 1000;
  if (settings.mode === "time" && !failReason) seconds = settings.timeLimit;
  const partial = seconds - chart.wpm.length;
  if (partial >= 0.5 || !chart.wpm.length) {
    const c = countChars();
    chart.wpm.push(round((c.wpmChars * 12) / seconds));
    chart.raw.push(round((bucket.keys * 12) / Math.max(partial, 0.5)));
    chart.err.push(bucket.errors);
  }

  const c = countChars();
  const raws = chart.raw;
  const consistency = raws.length > 1 && mean(raws) > 0 ? round(kogasa(stdDev(raws) / mean(raws))) : 100;
  sessionSeconds += seconds;
  const result = {
    wpm: round((c.wpmChars * 12) / seconds),
    rawWpm: round((c.rawChars * 12) / seconds),
    acc: round(accuracy()),
    consistency: Math.max(0, consistency),
    wpmChars: c.wpmChars,
    rawChars: c.rawChars,
    charStats: c.charStats,
    testDuration: round(seconds),
    mode: settings.mode,
    mode2: settings.mode2,
    quoteLength: settings.quoteLength,
    language: settings.language,
    punctuation: settings.punctuation,
    numbers: settings.numbers,
    difficulty: settings.difficulty,
    blindMode: settings.blind,
    chartData: chart,
    bailedOut: false,
  };

  const invalid = [];
  if (failReason) invalid.push(`failed (${failReason})`);
  if (result.acc < 75) invalid.push("accuracy");
  if (result.wpm <= 0) invalid.push("wpm");
  if (seconds < 1) invalid.push("too short");

  // Read before recording, so the result can be compared with what came before it.
  const prevPb = getLocalPb(settings);
  const lastWpm = getLastWpm();
  if (!invalid.length && !repeated) recordLocalResult(settings, result.wpm);

  const typedCount = wordIndex + (input ? 1 : 0);
  const id = restartId;
  showResult(result, {
    isStale: () => id !== restartId,
    settings,
    invalid,
    repeated,
    sessionSeconds,
    words: words.slice(0, Math.max(typedCount, 1)),
    inputs: input ? [...history, input] : [...history],
    replay,
    missedWords: [...errorWordIndexes].map((i) => words[i]).filter(Boolean),
    prevPb,
    lastWpm,
  });
}

export async function restart({ repeat = false, practice = null, instant = false } = {}) {
  const id = ++restartId;
  restarting = true;
  if (active) {
    incomplete.tests++;
    incomplete.seconds += elapsedSeconds();
  }
  clearTimeout(timerHandle);
  stopPace();
  active = false;
  finished = false;
  document.body.classList.remove("focus");
  els.page.classList.remove("active");
  updateLiveVisibility();

  const fadeTarget = isResultVisible() ? els.result : els.typingTest;
  if (!instant && isTestPageVisible()) {
    fadeTarget.classList.add("faded");
    await sleep(125);
    if (id !== restartId) return;
  }

  practiceWords = practice;
  if (!repeat || !settings) {
    settings = snapshotSettings();
    words = await buildWords(settings);
    repeated = false;
    if (id !== restartId) return;
  } else {
    words = settings.mode === "zen" ? [""] : words.slice();
    repeated = true;
  }

  clearTimeout(timerHandle);
  stopPace();
  active = false;
  restarting = false;
  history = [];
  input = "";
  wordIndex = 0;
  keys = { correct: 0, incorrect: 0 };
  bucket = { keys: 0, errors: 0 };
  chart = { wpm: [], raw: [], err: [] };
  replay = [];
  errorWordIndexes = new Set();

  hideResult();
  fadeTarget.classList.remove("faded");
  els.typingTest.classList.add("faded");
  els.typingTest.classList.remove("hidden");
  els.languageButton.querySelector("span").textContent = settings.quote
    ? `${languageDisplay(settings.language)} · ${settings.quoteLength}`
    : languageDisplay(settings.language);
  els.languageButton.classList.toggle("invisible", settings.mode === "zen" || settings.mode === "custom");
  renderAll();
  keymapNext(nextChar());
  void els.typingTest.offsetWidth;
  els.typingTest.classList.remove("faded");
  if (isTestPageVisible()) focusInput();
}

export function repeatTest() {
  restart({ repeat: true });
}

export function practiceMissed(list) {
  if (!list.length) return false;
  const pool = [];
  for (const w of list) pool.push(w, w, w);
  restart({ practice: shuffle(pool) });
  return true;
}

// ---------- input handling ----------

export function focusInput() {
  els.input.focus({ preventScroll: true });
}

const isTypingKey = (e) => (e.key.length === 1 || e.key === "Backspace") && !e.ctrlKey && !e.metaKey;

// Called by the global keydown dispatcher while the test page is shown.
export function handleKeydown(e) {
  if (e.key === "Tab" && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    if (config.quickRestart === "tab") return restart();
    (isResultVisible() ? els.nextButton : els.restartButton).focus();
    return;
  }
  if (e.key === "Enter" && config.quickRestart === "enter" && !(settings?.mode === "zen" && active)) {
    e.preventDefault();
    return restart();
  }

  const ae = document.activeElement;
  if (ae !== els.input) {
    if (ae?.matches?.("button, a") && (e.key === "Enter" || e.key === " ")) return;
    if (ae?.matches?.("input, textarea, select")) return;
    if (!isResultVisible() && isTypingKey(e)) {
      e.preventDefault();
      focusInput();
    }
    return;
  }

  updateCapsWarning(e);
  if (e.key === "Backspace") {
    e.preventDefault();
    return onBackspace(e.ctrlKey || e.altKey || e.metaKey);
  }
  if (e.key === "Enter") {
    if (settings?.mode === "zen" && e.shiftKey) {
      e.preventDefault();
      finish();
    }
    return;
  }
  if (e.key.length !== 1 || (e.ctrlKey && !e.altKey) || e.metaKey) return;
  e.preventDefault();
  onChar(e.key);
}

// Mobile keyboards often report "Unidentified" keys, so fall back to input events.
function onInputEvent(e) {
  if (e.inputType === "deleteContentBackward") onBackspace(false);
  else if (e.inputType === "deleteWordBackward") onBackspace(true);
  else if (e.data) for (const ch of e.data) onChar(ch);
  els.input.value = " ";
}

function updateCapsWarning(e) {
  if (typeof e.getModifierState !== "function") return;
  const on = config.capsLockWarning && e.getModifierState("CapsLock");
  els.capsWarning.classList.toggle("hidden", !on);
}

function onInputBlur() {
  clearTimeout(focusWarningTimeout);
  focusWarningTimeout = setTimeout(() => {
    if (document.activeElement === els.input || !isTestPageVisible() || isResultVisible()) return;
    if (document.activeElement === els.restartButton) return;
    if (!config.showOutOfFocusWarning) return;
    els.wordsWrapper.classList.add("blurred");
    els.outOfFocus.classList.remove("hidden");
  }, 500);
}

function onInputFocus() {
  clearTimeout(focusWarningTimeout);
  els.wordsWrapper.classList.remove("blurred");
  els.outOfFocus.classList.add("hidden");
}

// ---------- config bar ----------

function updateConfigBar() {
  const mode = config.mode;
  $$("#testConfig [data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  $$("#testConfig [data-toggle]").forEach((b) => b.classList.toggle("active", !!config[b.dataset.toggle]));
  const presetTime = ["15", "30", "60", "120"].includes(String(config.time));
  const presetWords = ["10", "25", "50", "100"].includes(String(config.words));
  $$("#testConfig [data-time]").forEach((b) => b.classList.toggle("active", b.dataset.time === String(config.time)));
  $$("#testConfig [data-words]").forEach((b) => b.classList.toggle("active", b.dataset.words === String(config.words)));
  $("#testConfig [data-custom='time']").classList.toggle("active", !presetTime);
  $("#testConfig [data-custom='words']").classList.toggle("active", !presetWords);
  $$("#testConfig [data-quote]").forEach((b) => b.classList.toggle("active", b.dataset.quote === config.quoteLength));

  $$("#testConfig .opt").forEach((b) => {
    if (!b.dataset.custom && !b.dataset.action) b.setAttribute("aria-pressed", b.classList.contains("active"));
  });

  const show = (sel, on) => $(sel).classList.toggle("hidden", !on);
  show("#testConfig .puncAndNum", mode === "time" || mode === "words");
  show("#testConfig .sub.time", mode === "time");
  show("#testConfig .sub.words", mode === "words");
  show("#testConfig .sub.quote", mode === "quote");
  show("#testConfig .sub.custom", mode === "custom");
}

function applyFontFamily() {
  const family = config.fontFamily;
  const id = `font-${family.replace(/\s+/g, "-")}`;
  if (!document.getElementById(id) && family !== DEFAULT_FONT) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
    document.head.append(link);
  }
  document.documentElement.style.setProperty("--font", `"${family}", Georgia, serif`);
  document.fonts.load(`1em "${family}"`).finally(() => relayout());
}

const relayout = () => {
  if (!wordEls.length) return;
  measure();
  updateCaret(true);
  lineOffset = -1;
  updateLineScroll();
};

function onConfigChange(key) {
  if (key === "mode" || key === "punctuation" || key === "numbers" || key === "time" || key === "words" || key === "quoteLength") {
    updateConfigBar();
  }
  if (RESTART_KEYS.has(key) && settings) return restart();
  if (key === "blindMode" && settings && !active) {
    settings.blind = config.blindMode;
    wordEls.forEach((_, i) => renderWord(i));
  }
  if (key === "indicateTypos" && settings) wordEls.forEach((_, i) => i <= wordIndex && renderWord(i));
  if (key === "caretStyle" || key === "smoothCaret") updateCaret(true);
  if (key === "fontSize") {
    document.documentElement.style.setProperty("--font-size", config.fontSize);
    relayout();
  }
  if (key === "fontFamily") applyFontFamily();
  if (["timerStyle", "liveWpm", "liveAcc"].includes(key)) updateLiveVisibility();
  if (key === "keymapMode") {
    renderKeymap();
    keymapNext(nextChar());
  }
  if (key === "showKeyTips") $("#footer .keyTips").classList.toggle("hidden", !config.showKeyTips);
}

// ---------- page lifecycle ----------

export function onShow() {
  if (!settings) return restart({ instant: true });
  if (active) return restart({ instant: true });
  requestAnimationFrame(() => {
    relayout();
    if (!isResultVisible()) focusInput();
  });
}

export function onHide() {
  if (active) restart({ instant: true });
}

export function init() {
  Object.assign(els, {
    page: $("#pageTest"),
    typingTest: $("#typingTest"),
    result: $("#result"),
    wordsWrapper: $("#wordsWrapper"),
    words: $("#words"),
    input: $("#wordsInput"),
    outOfFocus: $("#outOfFocusWarning"),
    capsWarning: $("#capsWarning"),
    restartButton: $("#restartTestButton"),
    nextButton: $("#nextTestButton"),
    languageButton: $("#languageButton"),
    miniTimer: $("#miniTimer"),
    miniWpm: $("#miniWpm"),
    miniAcc: $("#miniAcc"),
    textTimer: $("#textTimer"),
    barTimer: $("#barTimer"),
    barTimerFill: $("#barTimer .fill"),
  });
  els.caret = document.createElement("div");
  els.caret.id = "caret";
  els.paceCaret = document.createElement("div");
  els.paceCaret.id = "paceCaret";
  els.paceCaret.className = "hidden";

  els.input.value = " ";
  els.input.addEventListener("input", onInputEvent);
  els.input.addEventListener("blur", onInputBlur);
  els.input.addEventListener("focus", onInputFocus);
  els.wordsWrapper.addEventListener("click", focusInput);
  document.addEventListener("keyup", (e) => isTestPageVisible() && updateCapsWarning(e));

  els.restartButton.addEventListener("click", () => restart());
  els.nextButton.addEventListener("click", () => restart());
  $("#repeatTestButton").addEventListener("click", () => repeatTest());
  els.languageButton.addEventListener("click", () => openCommandLine(settings?.mode === "quote" ? "quoteLength" : "language"));

  $$("#testConfig [data-mode]").forEach((b) => b.addEventListener("click", () => setConfig("mode", b.dataset.mode)));
  $$("#testConfig [data-toggle]").forEach((b) =>
    b.addEventListener("click", () => setConfig(b.dataset.toggle, !config[b.dataset.toggle]))
  );
  $$("#testConfig [data-time]").forEach((b) => b.addEventListener("click", () => setConfig("time", +b.dataset.time)));
  $$("#testConfig [data-words]").forEach((b) => b.addEventListener("click", () => setConfig("words", +b.dataset.words)));
  $$("#testConfig [data-quote]").forEach((b) => b.addEventListener("click", () => setConfig("quoteLength", b.dataset.quote)));
  $$("#testConfig [data-custom]").forEach((b) => b.addEventListener("click", () => openCustomAmountModal(b.dataset.custom)));
  $("#testConfig [data-action='customText']").addEventListener("click", () => openCustomTextModal());
  $$("#testConfig button").forEach((b) => b.addEventListener("mouseup", () => b.blur()));

  // Moving the mouse brings back the UI hidden while typing.
  let last = null;
  document.addEventListener("mousemove", (e) => {
    if (last && Math.abs(e.clientX - last[0]) + Math.abs(e.clientY - last[1]) > 4) document.body.classList.remove("focus");
    last = [e.clientX, e.clientY];
  });

  window.addEventListener("resize", debounce(relayout, 100));
  document.fonts?.ready.then(relayout);

  subscribe(onConfigChange);
  document.documentElement.style.setProperty("--font-size", config.fontSize);
  if (config.fontFamily !== DEFAULT_FONT) applyFontFamily();
  $("#footer .keyTips").classList.toggle("hidden", !config.showKeyTips);
  updateConfigBar();
  renderKeymap();
}
