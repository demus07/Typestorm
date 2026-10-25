import { $, $$, esc, formatDate } from "../utils.js";
import { api } from "../api.js";
import { auth } from "../auth.js";
import { notify } from "../notifications.js";

const state = { period: "allTime", mode2: "15", page: 0, data: null };
let countdown = null;

async function load() {
  const page = $("#pageLeaderboards");
  const tbody = page.querySelector("tbody");
  $$("[data-period]", page).forEach((b) => b.classList.toggle("active", b.dataset.period === state.period));
  $$("[data-lbmode]", page).forEach((b) => b.classList.toggle("active", b.dataset.lbmode === state.mode2));
  $$("[data-period], [data-lbmode]", page).forEach((b) => b.setAttribute("aria-pressed", b.classList.contains("active")));
  tbody.innerHTML = `<tr><td colspan="7" class="loading">Loading results</td></tr>`;

  try {
    state.data = await api.get(`/api/leaderboards?mode2=${state.mode2}&period=${state.period}&page=${state.page}`);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">Failed to load leaderboard</td></tr>`;
    notify(err.message, "bad");
    return;
  }
  const { entries, total, pageSize, you } = state.data;
  const me = auth.user?.username;
  tbody.innerHTML = entries.length
    ? entries
        .map((e) => {
          const date = new Date(e.createdAt);
          return `<tr class="${e.username === me ? "me" : ""}">
            <td class="rank">${e.rank}</td>
            <td class="name"><a href="/profile/${encodeURIComponent(e.username)}" data-link><span class="avatar" aria-hidden="true">${esc(e.username[0])}</span>${esc(e.username)}</a></td>
            <td class="num wpmCell">${e.wpm.toFixed(2)}</td>
            <td class="num">${(e.acc ?? 0).toFixed(2)}%</td>
            <td class="num">${(e.rawWpm ?? e.wpm).toFixed(2)}</td>
            <td class="num">${e.consistency != null ? e.consistency.toFixed(2) + "%" : "-"}</td>
            <td class="num date">${formatDate(date, false)}<div class="sub">${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div></td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="7" class="empty">No qualifying results ${state.period === "daily" ? "today" : "yet"}. A 15 or 60 second English test, signed in, puts you here.</td></tr>`;

  const pages = Math.max(1, Math.ceil(total / pageSize));
  page.querySelector(".pageNumber").textContent = `Page ${state.page + 1} of ${pages}`;
  page.querySelector("[data-lbnav='prev']").disabled = state.page === 0;
  page.querySelector("[data-lbnav='next']").disabled = (state.page + 1) * pageSize >= total;
  page.querySelector("[data-lbnav='you']").classList.toggle("hidden", !you);
  page.querySelector(".yourRank").innerHTML = auth.user
    ? you
      ? `<span>Your position</span><span class="value">${you.rank}</span><span>of ${total}, at ${you.wpm.toFixed(2)} wpm</span>`
      : "You don't have a qualifying result on this board yet."
    : `<span><a href="/login" data-link>Sign in</a> to see where you stand.</span>`;
  updateCountdown();
}

const scope = () => `${state.period === "daily" ? "Today" : "All time"}, ${state.mode2} seconds`;

function updateCountdown() {
  clearInterval(countdown);
  const sub = $("#pageLeaderboards .subtitle");
  const reset = state.data?.nextReset;
  if (!reset) {
    const total = state.data?.total ?? 0;
    sub.textContent = `${scope()} · ${total} ${total === 1 ? "typist" : "typists"}`;
    return;
  }
  const tick = () => {
    const ms = Math.max(0, reset - Date.now());
    const h = Math.floor(ms / 36e5);
    const m = Math.floor((ms % 36e5) / 6e4);
    const s = Math.floor((ms % 6e4) / 1e3);
    sub.textContent = `${scope()} · resets in ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };
  tick();
  countdown = setInterval(tick, 1000);
}

export function initLeaderboards() {
  const page = $("#pageLeaderboards");
  page.addEventListener("click", (e) => {
    const period = e.target.closest("[data-period]");
    const mode = e.target.closest("[data-lbmode]");
    const nav = e.target.closest("[data-lbnav]");
    if (period) {
      state.period = period.dataset.period;
      state.page = 0;
    } else if (mode) {
      state.mode2 = mode.dataset.lbmode;
      state.page = 0;
    } else if (nav) {
      const action = nav.dataset.lbnav;
      if (action === "prev") state.page = Math.max(0, state.page - 1);
      if (action === "next") state.page++;
      if (action === "first") state.page = 0;
      if (action === "you" && state.data?.you) state.page = Math.floor((state.data.you.rank - 1) / state.data.pageSize);
    } else return;
    load();
  });
}

export function onShowLeaderboards() {
  load();
}

export function onHideLeaderboards() {
  clearInterval(countdown);
}
