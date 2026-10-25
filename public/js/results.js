import { $, esc, formatDuration, round } from "./utils.js";
import { api } from "./api.js";
import { auth } from "./auth.js";
import { notify } from "./notifications.js";
import { languageDisplay } from "./words.js";
import { consumeIncomplete, practiceMissed } from "./test.js";

let chart = null;
let ctx = null; // context of the last shown result
let replayTimer = null;

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let countToken = 0;

// Numbers count up once, quickly, so the result lands rather than appears.
function countUp(el, to, format) {
  const token = countToken;
  if (reducedMotion()) return (el.textContent = format(to));
  const start = performance.now();
  const step = (now) => {
    if (token !== countToken) return;
    const p = Math.min(1, (now - start) / 900);
    el.textContent = format(to * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(step);
  };
  el.textContent = format(0);
  requestAnimationFrame(step);
}

// One honest sentence of context, measured against this typist's own history.
function verdictText(r, s, { invalid, prevPb, lastWpm }) {
  if (invalid.length) return "This one won't be saved, but the practice still counts.";
  if ((r.mode === "time" || r.mode === "words") && !s.practice) {
    if (prevPb == null) return "A first result with these settings.";
    if (r.wpm > prevPb) return r.wpm - prevPb < 1 ? "A new best, by a hair." : `A new best, by ${Math.round(r.wpm - prevPb)} wpm.`;
    const gap = Math.round(prevPb - r.wpm);
    return gap === 0 ? "Level with your best." : `${gap} wpm from your best.`;
  }
  if (lastWpm == null) return "";
  const d = Math.round(r.wpm - lastWpm);
  if (d === 0) return "The same pace as last time.";
  return d > 0 ? `${d} wpm faster than last time.` : `${-d} wpm slower than last time.`;
}

export const isResultVisible = () => !$("#result").classList.contains("hidden");

export function hideResult() {
  countToken++;
  stopReplay();
  $("#result").classList.add("hidden");
  $("#resultWordsHistory").classList.add("hidden");
  $("#resultReplay").classList.add("hidden");
}

function testTypeText(r, s) {
  const lines = [];
  if (s.practice) lines.push("practice missed");
  else if (r.mode === "quote") lines.push(`quote ${s.quoteLength}`);
  else if (r.mode === "zen" || r.mode === "custom") lines.push(r.mode);
  else lines.push(`${r.mode} ${r.mode2}`);
  if (r.mode !== "custom" && r.mode !== "zen") lines.push(languageDisplay(r.language));
  if (r.punctuation) lines.push("punctuation");
  if (r.numbers) lines.push("numbers");
  if (r.difficulty !== "normal") lines.push(r.difficulty);
  if (r.blindMode) lines.push("blind");
  return lines.map(esc).join("<br>");
}

export async function showResult(result, context) {
  ctx = { result, ...context };
  const { settings, invalid, repeated } = context;
  const el = $("#result");

  $("#resWpm").textContent = Math.round(result.wpm);
  $("#resWpm").title = `${result.wpm.toFixed(2)} wpm`;
  $("#resAcc").textContent = `${Math.floor(result.acc)}%`;
  $("#resAcc").title = `${result.acc.toFixed(2)}%`;
  $("#resRaw").textContent = Math.round(result.rawWpm);
  $("#resRaw").title = `${result.rawWpm.toFixed(2)} wpm`;
  $("#resChars").textContent = result.charStats.join("/");
  $("#resConsistency").textContent = `${Math.round(result.consistency)}%`;
  $("#resConsistency").title = `${result.consistency.toFixed(2)}%`;
  $("#resTime").textContent = `${Math.round(result.testDuration)}s`;
  $("#resTime").title = `${result.testDuration.toFixed(2)}s`;
  $("#resSession").textContent = `${formatDuration(context.sessionSeconds)} session`;
  $("#resTestType").innerHTML = testTypeText(result, settings);
  $("#resVerdict").textContent = verdictText(result, settings, context);

  const other = [...(invalid.length ? [`invalid (${invalid.join(", ")})`] : []), ...(repeated ? ["repeated"] : [])];
  $("#result .group.info").classList.toggle("hidden", !other.length);
  $("#resOther").innerHTML = other.map(esc).join("<br>");

  $("#result .group.source").classList.toggle("hidden", !settings.quote);
  $("#resSource").textContent = settings.quote?.source ?? "";

  $("#result .crown").classList.add("hidden");
  $("#practiceMissedButton").classList.toggle("hidden", !context.missedWords.length);
  $("#resultWordsHistory").classList.add("hidden");
  $("#resultReplay").classList.add("hidden");
  $("#resultSaveNotice").classList.toggle("hidden", !!auth.user);

  if (auth.user && !invalid.length) saveResult(result);

  $("#typingTest").classList.add("faded");
  await new Promise((r) => setTimeout(r, 125));
  if (context.isStale()) return;
  $("#typingTest").classList.add("hidden");
  $("#typingTest").classList.remove("faded");
  el.classList.add("faded");
  el.classList.remove("hidden");
  renderChart(result, true);
  void el.offsetWidth;
  el.classList.remove("faded");
  countToken++;
  countUp($("#resWpm"), result.wpm, Math.round);
  countUp($("#resAcc"), result.acc, (v) => `${Math.floor(v)}%`);
  // Don't steal focus from the command line or a modal opened while the test ran.
  if (!document.activeElement?.closest("#commandLine, #modal")) document.activeElement?.blur();
}

async function saveResult(result) {
  const { chartData, ...rest } = result;
  const incomplete = consumeIncomplete();
  try {
    const res = await api.post("/api/results", {
      ...rest,
      chartData,
      incompleteTests: incomplete.tests,
      incompleteSeconds: round(incomplete.seconds),
    });
    if (res.isPb) {
      $("#result .crown").classList.remove("hidden");
      notify("New personal best!", "good");
    }
  } catch (err) {
    notify(`Failed to save result: ${err.message}`, "bad", { duration: 5000 });
  }
}

function renderChart(result, animate = false) {
  const { wpm, raw, err } = result.chartData;
  const labels = wpm.map((_, i) => i + 1);
  const main = css("--main-color");
  const sub = css("--sub-color");
  const line = css("--line-color");
  const error = css("--error-color");
  const font = { family: css("--font-ui"), size: 11 };
  const maxErr = Math.max(...err, 1);

  chart?.destroy();
  if (!window.Chart) return;
  chart = new window.Chart($("#resultChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "wpm",
          data: wpm,
          borderColor: main,
          backgroundColor: main,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.35,
          yAxisID: "wpm",
          order: 2,
        },
        {
          label: "raw",
          data: raw,
          borderColor: sub,
          backgroundColor: sub,
          borderWidth: 1.25,
          borderDash: [3, 3],
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.35,
          yAxisID: "wpm",
          order: 3,
        },
        {
          label: "errors",
          data: err.map((e) => (e > 0 ? e : null)),
          type: "scatter",
          borderColor: error,
          backgroundColor: error,
          pointStyle: "rectRot",
          pointRadius: 3,
          pointBorderWidth: 0,
          yAxisID: "error",
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: animate && !reducedMotion() ? { duration: 900, easing: "easeOutQuart" } : { duration: 0 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: css("--bg-color"),
          titleColor: css("--text-color"),
          bodyColor: css("--text-color"),
          borderColor: line,
          borderWidth: 1,
          cornerRadius: 4,
          padding: 10,
          titleFont: font,
          bodyFont: font,
          callbacks: { title: (items) => `${items[0].label}s` },
        },
      },
      scales: {
        x: {
          ticks: { color: sub, font, autoSkip: true, maxRotation: 0 },
          grid: { display: false },
          border: { color: line },
        },
        wpm: {
          position: "left",
          beginAtZero: true,
          ticks: { color: sub, font, maxTicksLimit: 5, precision: 0 },
          grid: { color: line },
          border: { display: false },
        },
        error: {
          position: "right",
          beginAtZero: true,
          max: Math.ceil(maxErr * 1.2) || 1,
          ticks: { color: sub, font, precision: 0, maxTicksLimit: 5 },
          grid: { display: false },
          border: { display: false },
        },
      },
    },
  });
}

// Re-skin the chart when the theme changes while results are visible.
export function refreshChartColors() {
  if (ctx && isResultVisible()) renderChart(ctx.result);
}

function wordsMarkup(words, inputs, upto = Infinity) {
  return words
    .map((target, i) => {
      if (i > upto) return `<div class="word">${esc(target)}</div>`;
      const typed = inputs[i] ?? "";
      let html = "";
      for (let j = 0; j < Math.max(target.length, typed.length); j++) {
        if (j >= target.length) html += `<letter class="incorrect extra">${esc(typed[j])}</letter>`;
        else if (j >= typed.length) html += `<letter>${esc(target[j])}</letter>`;
        else html += `<letter class="${typed[j] === target[j] ? "correct" : "incorrect"}">${esc(target[j])}</letter>`;
      }
      const error = i < inputs.length && typed !== target && (i < inputs.length - 1 || typed.length >= target.length);
      return `<div class="word${error ? " error" : ""}" title="${esc(typed)}">${html}</div>`;
    })
    .join("");
}

function toggleWordsHistory() {
  const box = $("#resultWordsHistory");
  if (!ctx) return;
  if (box.classList.contains("hidden")) {
    const words = ctx.settings.mode === "zen" ? ctx.inputs : ctx.words;
    box.querySelector(".words").innerHTML = wordsMarkup(words, ctx.inputs);
    box.classList.remove("hidden");
  } else box.classList.add("hidden");
}

function stopReplay() {
  clearInterval(replayTimer);
  replayTimer = null;
  const icon = $("#replayToggle i");
  if (icon) icon.className = "fas fa-play";
}

function playReplay() {
  if (!ctx) return;
  stopReplay();
  const { replay, words, settings } = ctx;
  const box = $("#resultReplay .words");
  const isZen = settings.mode === "zen";
  const targets = isZen ? ctx.inputs : words;
  const inputs = [];
  let idx = 0;
  const startedAt = performance.now();
  $("#replayToggle i").className = "fas fa-pause";
  const draw = (w) => {
    const shown = isZen ? inputs.slice(0, w + 1) : targets;
    box.innerHTML = wordsMarkup(isZen ? shown.map((x) => x ?? "") : shown, inputs, w);
    box.querySelector(".word:nth-child(" + (w + 1) + ")")?.classList.add("active");
  };
  draw(0);
  replayTimer = setInterval(() => {
    const t = performance.now() - startedAt;
    let changed = false;
    while (idx < replay.length && replay[idx].t <= t) {
      const ev = replay[idx++];
      inputs.length = ev.w + 1;
      inputs[ev.w] = ev.i;
      for (let k = 0; k < ev.w; k++) inputs[k] ??= ctx.inputs[k];
      changed = true;
    }
    $("#replayTime").textContent = `${Math.floor(t / 1000)}s`;
    if (changed) draw(replay[idx - 1].w);
    if (idx >= replay.length) stopReplay();
  }, 16);
}

function toggleReplay() {
  const box = $("#resultReplay");
  if (box.classList.contains("hidden")) {
    box.classList.remove("hidden");
    playReplay();
  } else {
    stopReplay();
    box.classList.add("hidden");
  }
}

async function screenshot() {
  const target = $("#result");
  try {
    if (!window.html2canvas) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.append(s);
      });
    }
    const buttons = target.querySelector(".buttons");
    buttons.style.visibility = "hidden";
    const canvas = await window.html2canvas(target, { backgroundColor: css("--bg-color"), scale: 2 });
    buttons.style.visibility = "";
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      notify("Copied to clipboard", "good");
    } catch {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `typestorm-${Date.now()}.png`;
      a.click();
      notify("Screenshot downloaded", "good");
    }
  } catch {
    target.querySelector(".buttons").style.visibility = "";
    notify("Failed to take a screenshot", "bad");
  }
}

export function initResults() {
  $("#wordsHistoryButton").addEventListener("click", toggleWordsHistory);
  $("#replayButton").addEventListener("click", toggleReplay);
  $("#replayToggle").addEventListener("click", () => (replayTimer ? stopReplay() : playReplay()));
  $("#screenshotButton").addEventListener("click", screenshot);
  $("#practiceMissedButton").addEventListener("click", () => {
    if (!practiceMissed(ctx?.missedWords ?? [])) notify("No missed words to practice", "notice");
  });
  $("#result").addEventListener("click", (e) => {
    if (e.target.closest("button")) e.target.closest("button").blur();
  });
}
