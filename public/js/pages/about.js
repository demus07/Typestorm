import { $ } from "../utils.js";
import { api } from "../api.js";

const compact = (n) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
};

function typingTime(seconds) {
  const h = seconds / 3600;
  if (h >= 24 * 365) return `${(h / (24 * 365)).toFixed(1)} years`;
  if (h >= 48) return `${Math.round(h / 24)} days`;
  if (h >= 1) return `${Math.round(h)} ${Math.round(h) === 1 ? "hour" : "hours"}`;
  const m = Math.round(seconds / 60);
  return `${m} ${m === 1 ? "minute" : "minutes"}`;
}

export async function onShowAbout() {
  try {
    const { stats } = await api.get("/api/stats");
    $("#statStarted").textContent = compact(stats.testsStarted);
    $("#statCompleted").textContent = compact(stats.testsCompleted);
    $("#statTime").textContent = typingTime(stats.timeTyping);
    // Small totals read as an empty room, so they stay hidden until they mean something.
    $("#pageAbout .globalStats").classList.toggle("hidden", stats.testsCompleted < 1000);
  } catch {}
}
