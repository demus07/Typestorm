import { $, esc, formatDate, formatDuration, mean } from "../utils.js";
import { api } from "../api.js";
import { auth } from "../auth.js";
import { notify } from "../notifications.js";
import { languageDisplay } from "../words.js";
import { seedFromProfile } from "../localstats.js";

let results = [];
let shown = 0;
let chart = null;
let loadId = 0;
const PAGE = 10;

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function profileCardMarkup(p, isOwn) {
  return `
    <div class="identity">
      <div class="label">${isOwn ? "Your account" : "Typist"}</div>
      <div class="name">${esc(p.username)}</div>
      <div class="joined" title="${new Date(p.joined).toLocaleString()}">Joined ${formatDate(p.joined, false)}</div>
    </div>
    <div class="typingStats">
      <div><div class="top">Tests started</div><div class="value">${p.testsStarted}</div></div>
      <div><div class="top">Tests completed</div><div class="value">${p.testsCompleted}</div></div>
      <div><div class="top">Time typing</div><div class="value">${formatDuration(p.timeTyping)}</div></div>
    </div>`;
}

function pbsMarkup(pbs) {
  const box = (mode, keys, unit, heading) => `
    <div class="pbGroup">
      <div class="label">${heading}</div>
      <div class="row">
      ${keys
        .map((k) => {
          const pb = pbs[mode][k];
          const title = pb
            ? `${pb.wpm.toFixed(2)} wpm\n${(pb.rawWpm ?? pb.wpm).toFixed(2)} raw\n${(pb.acc ?? 0).toFixed(2)}% accuracy\n${pb.consistency != null ? pb.consistency.toFixed(2) + "% consistency\n" : ""}${languageDisplay(pb.language ?? "english")}${pb.punctuation ? ", punctuation" : ""}${pb.numbers ? ", numbers" : ""}\n${formatDate(pb.createdAt)}`
            : "";
          return `<div class="pb${pb ? "" : " empty"}" title="${esc(title)}">
            <div class="mode">${k} ${unit}</div>
            <div class="wpm">${pb ? Math.round(pb.wpm) : "–"}</div>
            <div class="acc">${pb ? Math.floor(pb.acc ?? 0) + "% accuracy" : "No result"}</div>
          </div>`;
        })
        .join("")}
      </div>
    </div>`;
  return box("time", ["15", "30", "60", "120"], "sec", "Personal bests, timed") + box("words", ["10", "25", "50", "100"], "words", "Personal bests, word count");
}

// A ledger: one row per measure, read across as best, average and the last ten.
// The last-ten column notes which way it leans against the overall average.
function statsMarkup() {
  if (!results.length) return `<p class="empty">No saved tests yet.</p>`;
  const last10 = results.slice(0, 10);
  const rows = [
    ["Speed", (r) => r.wpm, ""],
    ["Raw speed", (r) => r.rawWpm ?? r.wpm, ""],
    ["Accuracy", (r) => r.acc ?? 0, "%"],
    ["Consistency", (r) => r.consistency, "%"],
  ];
  const body = rows
    .map(([label, get, unit]) => {
      const all = results.map(get).filter((v) => v != null);
      const recent = last10.map(get).filter((v) => v != null);
      if (!all.length) return "";
      const avg = mean(all);
      const lately = mean(recent);
      const d = Math.round(lately - avg);
      const lean = d ? `<span class="lean ${d > 0 ? "up" : "down"}">${d > 0 ? "↑" : "↓"} ${Math.abs(d)}</span>` : "";
      return `<tr><th scope="row">${label}</th><td>${Math.round(Math.max(...all))}${unit}</td><td>${Math.round(avg)}${unit}</td><td>${Math.round(lately)}${unit}${lean}</td></tr>`;
    })
    .join("");
  return `<table class="ledger"><thead><tr><th></th><th scope="col">Best</th><th scope="col">Average</th><th scope="col">Last 10</th></tr></thead><tbody>${body}</tbody></table>
    <p class="caption">${results.length} saved ${results.length === 1 ? "test" : "tests"}. Speed in words per minute.</p>`;
}

function modeText(r) {
  if (r.mode === "quote") return `quote ${r.quoteLength ?? ""}`.trim();
  if (r.mode === "zen" || r.mode === "custom") return r.mode;
  return `${r.mode} ${r.mode2}`;
}

function rowMarkup(r) {
  const info = [
    r.isPb ? '<span class="tag pb">PB</span>' : "",
    r.punctuation ? '<span class="tag">punctuation</span>' : "",
    r.numbers ? '<span class="tag">numbers</span>' : "",
    r.blindMode ? '<span class="tag">blind</span>' : "",
    r.difficulty && r.difficulty !== "normal" ? `<span class="tag">${esc(r.difficulty)}</span>` : "",
  ].join("");
  return `<tr>
    <td>${r.wpm.toFixed(2)}</td>
    <td>${(r.rawWpm ?? r.wpm).toFixed(2)}</td>
    <td>${(r.acc ?? 0).toFixed(2)}%</td>
    <td>${r.consistency != null ? r.consistency.toFixed(2) + "%" : "-"}</td>
    <td>${(r.charStats ?? []).join("/") || "-"}</td>
    <td>${esc(modeText(r))}</td>
    <td class="info">${info}</td>
    <td>${formatDate(r.createdAt)}</td>
  </tr>`;
}

function showMore() {
  const tbody = $("#pageAccount .historyTable tbody");
  tbody.insertAdjacentHTML("beforeend", results.slice(shown, shown + PAGE).map(rowMarkup).join(""));
  shown = Math.min(results.length, shown + PAGE);
  $("#pageAccount .loadMore").classList.toggle("hidden", shown >= results.length);
  if (!results.length) tbody.innerHTML = `<tr><td colspan="8" class="empty">No saved results yet. Finish a test while signed in and it appears here.</td></tr>`;
}

// Hex colour with alpha, for the dots and the wash under the average.
const alpha = (hex, a) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

function renderHistoryChart() {
  chart?.destroy();
  if (!window.Chart) return;
  const ordered = [...results].reverse();
  const main = css("--main-color");
  const sub = css("--sub-color");
  const font = { family: css("--font-ui"), size: 11 };
  const line = css("--line-color");
  const avg10 = ordered.map((_, i) => mean(ordered.slice(Math.max(0, i - 9), i + 1).map((r) => r.wpm)));
  chart = new window.Chart($("#historyChart"), {
    type: "line",
    data: {
      labels: ordered.map((_, i) => i + 1),
      datasets: [
        {
          label: "wpm",
          data: ordered.map((r) => r.wpm),
          showLine: false,
          pointRadius: 2.5,
          pointHoverRadius: 4,
          pointBorderWidth: 0,
          backgroundColor: alpha(main, 0.5),
          order: 2,
        },
        {
          label: "average of 10",
          data: avg10,
          borderColor: main,
          borderWidth: 2,
          pointRadius: (c) => (c.dataIndex === avg10.length - 1 ? 3.5 : 0),
          pointBackgroundColor: main,
          pointBorderWidth: 0,
          tension: 0.4,
          fill: "origin",
          backgroundColor: ({ chart: { ctx: c, chartArea: a } }) => {
            if (!a) return "transparent";
            const g = c.createLinearGradient(0, a.top, 0, a.bottom);
            g.addColorStop(0, alpha(main, 0.14));
            g.addColorStop(1, alpha(main, 0));
            return g;
          },
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: css("--bg-color"),
          titleColor: sub,
          bodyColor: css("--text-color"),
          borderColor: line,
          borderWidth: 1,
          cornerRadius: 4,
          padding: { x: 12, y: 10 },
          titleFont: font,
          bodyFont: { ...font, size: 12 },
          displayColors: false,
          callbacks: {
            title: (items) => {
              const r = ordered[items[0].dataIndex];
              return `${modeText(r)} · ${formatDate(r.createdAt)}`;
            },
            label: (item) =>
              item.dataset.label === "wpm" ? `${item.parsed.y.toFixed(1)} wpm` : `${Math.round(item.parsed.y)} wpm, average of 10`,
          },
        },
      },
      scales: {
        x: { ticks: { display: false }, grid: { display: false }, border: { display: false } },
        y: {
          beginAtZero: true,
          grace: "8%",
          ticks: { color: sub, font, maxTicksLimit: 4, precision: 0, padding: 10 },
          grid: { color: line, drawTicks: false },
          border: { display: false, dash: [2, 4] },
        },
      },
    },
  });
}

export async function onShowAccount(params = {}) {
  const id = ++loadId;
  const page = $("#pageAccount");
  const isOwn = !params.profile;
  page.classList.toggle("profileMode", !isOwn);
  page.querySelector(".profileCard").innerHTML = `<div class="loading">Loading profile</div>`;
  page.querySelector(".pbs").innerHTML = "";
  try {
    const { profile } = await api.get(isOwn ? "/api/users/me" : `/api/users/${encodeURIComponent(params.profile)}/profile`);
    if (id !== loadId) return;
    page.querySelector(".profileCard").innerHTML = profileCardMarkup(profile, isOwn);
    page.querySelector(".pbs").innerHTML = pbsMarkup(profile.pbs);
    if (!isOwn) return;
    seedFromProfile(profile.pbList);
    ({ results } = await api.get("/api/results"));
    if (id !== loadId) return;
    shown = 0;
    page.querySelector(".historyTable tbody").innerHTML = "";
    page.querySelector(".statsGrid").innerHTML = statsMarkup();
    page.querySelector(".chartWrap").classList.toggle("hidden", results.length < 2);
    showMore();
    renderHistoryChart();
  } catch (err) {
    if (id !== loadId) return;
    if (err.status === 401) {
      auth.set(null);
      return;
    }
    page.querySelector(".profileCard").innerHTML = `<div class="empty">${esc(err.status === 404 ? "User not found" : err.message)}</div>`;
    if (err.status !== 404) notify(err.message, "bad");
  }
}

export function initAccount() {
  $("#pageAccount .loadMore").addEventListener("click", showMore);
}
