import { $ } from "./utils.js";
import { config, loadLocalConfig, subscribe, syncAccountConfig } from "./config.js";
import { applyTheme, logoSvg } from "./themes.js";
import { playOverture } from "./overture.js";
import { auth, renderAccountButton } from "./auth.js";
import { notify, renderHistory, clearHistory } from "./notifications.js";
import { initRouter, registerPage, navigate, currentPage } from "./router.js";
import * as test from "./test.js";
import { initResults, refreshChartColors } from "./results.js";
import { initCommandLine, openCommandLine, isCommandLineOpen, handleCommandLineKey } from "./commandline.js";
import { isModalOpen, closeModal } from "./modals.js";
import { initSettings, onShowSettings } from "./pages/settings.js";
import { initLeaderboards, onShowLeaderboards, onHideLeaderboards } from "./pages/leaderboards.js";
import { initAccount, onShowAccount } from "./pages/account.js";
import { initLogin, onShowLogin } from "./pages/login.js";
import { onShowAbout } from "./pages/about.js";
import { api } from "./api.js";
import { seedFromProfile } from "./localstats.js";

loadLocalConfig();
applyTheme(config.theme);
$("#logo .icon").innerHTML = logoSvg();
renderAccountButton();

subscribe((key, value) => {
  if (key === "theme") {
    applyTheme(value);
    refreshChartColors();
  }
});

// A greeting for the time of day, with the typist's name when signed in.
function greet() {
  const h = new Date().getHours();
  const part = h < 5 || h >= 22 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  $("#greeting").textContent = auth.user ? `${part}, ${auth.user.username}.` : `${part}.`;
}
greet();
auth.onChange(greet);

// ---------- global keyboard handling ----------

function toggleAlerts(force) {
  const panel = $("#alertsPanel");
  const show = force ?? panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !show);
  if (show) renderHistory();
}

document.addEventListener("keydown", (e) => {
  if (isCommandLineOpen()) return handleCommandLineKey(e);
  if (isModalOpen()) {
    if (e.key === "Escape") closeModal();
    return;
  }
  if (!$("#alertsPanel").classList.contains("hidden") && e.key === "Escape") return toggleAlerts(false);

  const commandKey = config.quickRestart === "esc" ? "Tab" : "Escape";
  const paletteCombo = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p";
  if (e.key === commandKey || paletteCombo) {
    e.preventDefault();
    return openCommandLine();
  }
  if (e.key === "Escape" && config.quickRestart === "esc") {
    e.preventDefault();
    if (currentPage() !== "test") navigate("/");
    return test.restart();
  }
  if (currentPage() === "test") test.handleKeydown(e);
});

const refocusTest = () => {
  if (currentPage() === "test" && !document.querySelector("#result:not(.hidden)")) test.focusInput();
};
document.addEventListener("commandline:closed", refocusTest);
document.addEventListener("modal:closed", refocusTest);

// ---------- header / footer / overlays ----------

document.addEventListener("click", async (e) => {
  if (e.target.closest("[data-action='logout']")) {
    await auth.logout();
    notify("Signed out", "good");
    navigate("/");
  }
});
$("#alertsButton").addEventListener("click", () => toggleAlerts());
$("#alertsPanel").addEventListener("click", (e) => e.target.id === "alertsPanel" && toggleAlerts(false));
$("#clearAlerts").addEventListener("click", clearHistory);
$("#footerTheme").addEventListener("click", () => openCommandLine("theme"));
$("#modalWrapper").addEventListener("mousedown", (e) => e.target.id === "modalWrapper" && closeModal());

// The phone action bar steps aside once the footer comes into view.
if ("IntersectionObserver" in window) {
  // Short pages never hide it, since the footer is visible from the start.
  new IntersectionObserver(([entry]) => {
    const scrollable = document.documentElement.scrollHeight > window.innerHeight + 80;
    $("#mobileBar").classList.toggle("stepAside", entry.isIntersecting && scrollable);
  }).observe(
    $("#footer .bottom")
  );
}

auth.onChange(() => {
  const page = currentPage();
  if (!auth.user && page === "account" && location.pathname === "/account") navigate("/login", { replace: true });
});

// ---------- pages ----------

test.init();
initResults();
initCommandLine();
initSettings();
initLeaderboards();
initAccount();
initLogin();

registerPage("test", {
  onShow: () => (greet(), test.onShow()),
  onHide: test.onHide,
  onReselect: () => test.restart(),
});
registerPage("settings", { onShow: onShowSettings });
registerPage("leaderboards", { onShow: onShowLeaderboards, onHide: onHideLeaderboards });
registerPage("about", { onShow: onShowAbout });
registerPage("login", { onShow: onShowLogin });
registerPage("account", { onShow: onShowAccount, onReselect: onShowAccount });
registerPage("404");

initRouter();
playOverture();
syncAccountConfig();
if (auth.user) api.get("/api/users/me").then(({ profile }) => seedFromProfile(profile.pbList)).catch(() => {});
