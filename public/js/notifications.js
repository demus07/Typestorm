import { esc, formatDate } from "./utils.js";

const ICONS = { good: "fa-check", bad: "fa-times", notice: "fa-info-circle" };
const TITLES = { good: "success", bad: "error", notice: "notice" };
const history = [];

export function notify(message, type = "notice", { duration = 3000 } = {}) {
  const center = document.querySelector("#notificationCenter");
  const el = document.createElement("div");
  el.className = `notif ${type}`;
  el.innerHTML = `<div class="title"><i class="fas ${ICONS[type]}"></i>${TITLES[type]}</div><div class="message">${esc(message)}</div>`;
  center.prepend(el);
  requestAnimationFrame(() => el.classList.add("show"));

  const close = () => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 200);
  };
  el.addEventListener("click", close);
  if (duration) setTimeout(close, duration);

  history.unshift({ message, type, date: Date.now() });
  history.length = Math.min(history.length, 50);
  renderHistory();
}

export function renderHistory() {
  // The bell only appears once there is something to look back on.
  document.querySelector("#alertsButton")?.classList.toggle("hidden", !history.length);
  const list = document.querySelector("#alertsPanel .list");
  if (!list) return;
  list.innerHTML = history.length
    ? history
        .map(
          (n) => `<div class="item ${n.type}"><i class="fas ${ICONS[n.type]}"></i><div><div>${esc(n.message)}</div><div class="date">${formatDate(n.date)}</div></div></div>`
        )
        .join("")
    : `<div class="empty">Nothing to show</div>`;
}

export function clearHistory() {
  history.length = 0;
  renderHistory();
}
