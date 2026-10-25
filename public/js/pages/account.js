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

function statsMarkup() {
  const wpm = results.map((r) => r.wpm);
  const raw = results.map((r) => r.rawWpm ?? r.wpm);
  const acc = results.map((r) => r.acc ?? 0);
  const con = results.map((r) => r.consistency).filter((c) => c != null);
  const last10 = results.slice(0, 10);
  const stat = (label, value) => `<div class="stat"><div class="top">${label}</div><div class="value">${value}</div></div>`;
  const fmt = (n) => (Number.isFinite(n) && results.length ? Math.round(n) : "-");
  const pct = (n) => (Number.isFinite(n) && results.length ? `${Math.round(n)}%` : "-");
  return [
    stat("Highest wpm", fmt(Math.max(...wpm))),
    stat("Average wpm", fmt(mean(wpm))),
    stat("Average wpm, last 10", fmt(mean(last10.map((r) => r.wpm)))),
    stat("Highest raw wpm", fmt(Math.max(...raw))),
    stat("Average raw wpm", fmt(mean(raw))),
    stat("Average raw, last 10", fmt(mean(last10.map((r) => r.rawWpm ?? r.wpm)))),
    stat("Highest accuracy", pct(Math.max(...acc))),
    stat("Average accuracy", pct(mean(acc))),
    stat("Average accuracy, last 10", pct(mean(last10.map((r) => r.acc ?? 0)))),
    stat("Highest consistency", con.length ? pct(Math.max(...con)) : "-"),
    stat("Average consistency", con.length ? pct(mean(con)) : "-"),
    stat("Tests saved", results.length),
  ].join("");
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
          pointRadius: 2,
          pointHoverRadius: 4,
          backgroundColor: main,
          borderColor: main,
        },
        {
          label: "average of 10",
          data: avg10,
          borderColor: css("--text-color"),
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
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
          titleColor: css("--text-color"),
          bodyColor: css("--text-color"),
          borderColor: line,
          borderWidth: 1,
          cornerRadius: 4,
          padding: 10,
          titleFont: font,
          bodyFont: font,
          callbacks: {
            title: (items) => {
              const r = ordered[items[0].dataIndex];
              return `${modeText(r)} · ${formatDate(r.createdAt)}`;
            },
            label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: { ticks: { display: false }, grid: { display: false }, border: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { color: sub, font, maxTicksLimit: 6 },
          grid: { color: line },
          border: { display: false },
          title: { display: false },
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
