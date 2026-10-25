import { $, esc } from "./utils.js";
import { config, setConfig } from "./config.js";
import { THEMES, THEME_NAMES, previewTheme, clearPreview } from "./themes.js";
import { LANGUAGES, languageDisplay } from "./words.js";
import { QUOTE_LENGTHS } from "./quotes.js";
import { CLICK_SOUNDS, ERROR_SOUNDS, previewSound } from "./sound.js";
import { FONT_FAMILIES } from "./fonts.js";
import { auth } from "./auth.js";
import { navigate } from "./router.js";
import { restart, repeatTest } from "./test.js";
import { openCustomAmountModal, openCustomTextModal } from "./modals.js";
import { notify } from "./notifications.js";

let stack = []; // open subgroups
let filtered = [];
let activeIndex = 0;
let previewing = false;

const onOff = (key, title, icon) => group(key, title, icon, [false, true], (v) => (v ? "on" : "off"));

function group(key, title, icon, values, label = (v) => String(v), extra = {}) {
  return {
    id: key,
    display: `${title}...`,
    icon,
    subgroup: {
      title,
      list: values.map((v) => ({
        display: label(v),
        configKey: key,
        configValue: v,
        exec: () => setConfig(key, v),
        ...(extra.item?.(v) ?? {}),
      })),
    },
  };
}

function buildCommands() {
  const themeItems = THEME_NAMES.map((name) => ({
    display: name,
    configKey: "theme",
    configValue: name,
    exec: () => setConfig("theme", name),
    hover: () => previewTheme(name),
    swatch: THEMES[name],
  }));

  const commands = [
    onOff("punctuation", "Punctuation", "fa-at"),
    onOff("numbers", "Numbers", "fa-hashtag"),
    group("mode", "Mode", "fa-bars", ["time", "words", "quote", "zen", "custom"]),
    {
      ...group("time", "Time", "fa-clock", [15, 30, 60, 120]),
      after: [{ display: "custom...", exec: () => openCustomAmountModal("time") }],
    },
    {
      ...group("words", "Words", "fa-font", [10, 25, 50, 100]),
      after: [{ display: "custom...", exec: () => openCustomAmountModal("words") }],
    },
    group("quoteLength", "Quote length", "fa-quote-right", QUOTE_LENGTHS),
    group("language", "Language", "fa-language", LANGUAGES, languageDisplay),
    { id: "theme", display: "Theme...", icon: "fa-palette", subgroup: { title: "Theme", list: themeItems } },
    { display: "Change custom text", icon: "fa-pen", exec: () => openCustomTextModal() },
    group("difficulty", "Difficulty", "fa-star", ["normal", "expert", "master"]),
    group("quickRestart", "Quick restart", "fa-redo-alt", ["off", "tab", "esc", "enter"]),
    onOff("blindMode", "Blind mode", "fa-eye-slash"),
    onOff("freedomMode", "Freedom mode", "fa-feather-alt"),
    onOff("strictSpace", "Strict space", "fa-minus"),
    group("confidenceMode", "Confidence mode", "fa-backspace", ["off", "on", "max"]),
    group("stopOnError", "Stop on error", "fa-hand-paper", ["off", "word", "letter"]),
    group("indicateTypos", "Indicate typos", "fa-exclamation", ["off", "below", "replace"]),
    group("caretStyle", "Caret style", "fa-i-cursor", ["off", "default", "block", "outline", "underline"]),
    onOff("smoothCaret", "Smooth caret", "fa-i-cursor"),
    group("paceCaret", "Pace caret", "fa-tachometer-alt", ["off", "pb", "last", "custom"]),
    group("paceCaretCustomSpeed", "Pace caret speed", "fa-tachometer-alt", [60, 80, 100, 120, 150, 200], (v) => `${v} wpm`),
    onOff("smoothLineScroll", "Smooth line scroll", "fa-align-left"),
    group("timerStyle", "Timer/progress style", "fa-clock", ["off", "mini", "bar", "text"]),
    onOff("liveWpm", "Live WPM", "fa-tachometer-alt"),
    onOff("liveAcc", "Live accuracy", "fa-percentage"),
    group("keymapMode", "Keymap", "fa-keyboard", ["off", "static", "react", "next"]),
    group("fontSize", "Font size", "fa-font", [1, 1.25, 1.5, 2, 2.5, 3, 4]),
    group("fontFamily", "Font family", "fa-font", FONT_FAMILIES),
    group("playSoundOnClick", "Sound on click", "fa-volume-up", CLICK_SOUNDS, String, {
      item: (v) => ({ hover: () => previewSound("click", v) }),
    }),
    group("playSoundOnError", "Sound on error", "fa-volume-mute", ERROR_SOUNDS, String, {
      item: (v) => ({ hover: () => previewSound("error", v) }),
    }),
    group("soundVolume", "Sound volume", "fa-volume-down", [0.1, 0.25, 0.5, 0.75, 1], (v) => `${v * 100}%`),
    onOff("showKeyTips", "Key tips", "fa-question"),
    onOff("capsLockWarning", "Caps lock warning", "fa-lock"),
    onOff("showOutOfFocusWarning", "Out of focus warning", "fa-mouse-pointer"),
    { display: "Restart test", icon: "fa-redo-alt", exec: () => (navigate("/"), restart()) },
    { display: "Repeat test", icon: "fa-sync-alt", exec: () => (navigate("/"), repeatTest()) },
    { display: "Go to settings", icon: "fa-cog", exec: () => navigate("/settings") },
    { display: "Go to leaderboards", icon: "fa-crown", exec: () => navigate("/leaderboards") },
    { display: "Go to about", icon: "fa-info", exec: () => navigate("/about") },
  ];
  if (auth.user) {
    commands.push(
      { display: "Go to account", icon: "fa-user", exec: () => navigate("/account") },
      {
        display: "Sign out",
        icon: "fa-sign-out-alt",
        exec: async () => {
          await auth.logout();
          notify("Signed out", "good");
          navigate("/");
        },
      }
    );
  } else {
    commands.push({ display: "Sign in / register", icon: "fa-sign-in-alt", exec: () => navigate("/login") });
  }
  for (const c of commands) if (c.after) c.subgroup.list.push(...c.after);
  return commands;
}

export const isCommandLineOpen = () => !$("#commandLineWrapper").classList.contains("hidden");

export function openCommandLine(subgroupId = null) {
  const root = buildCommands();
  stack = [{ title: null, list: root }];
  if (subgroupId) {
    const g = root.find((c) => c.id === subgroupId);
    if (g) stack.push(g.subgroup);
  }
  $("#commandLineWrapper").classList.remove("hidden");
  const inputEl = $("#commandInput");
  inputEl.value = "";
  inputEl.focus();
  render(true);
}

export function closeCommandLine() {
  if (!isCommandLineOpen()) return;
  $("#commandLineWrapper").classList.add("hidden");
  if (previewing) clearPreview();
  previewing = false;
  document.dispatchEvent(new CustomEvent("commandline:closed"));
}

function currentList() {
  const level = stack[stack.length - 1];
  const query = $("#commandInput").value.trim().toLowerCase();
  let items = level.list.map((item) => ({ item, label: item.display }));
  // From the root, searching also reaches into every subgroup ("Theme > nord").
  if (query && stack.length === 1) {
    for (const c of level.list) {
      if (!c.subgroup) continue;
      for (const sub of c.subgroup.list) items.push({ item: sub, label: sub.display, parent: c.subgroup.title });
    }
  }
  if (!query) return items;
  const terms = query.split(/\s+/);
  return items.filter(({ label, parent }) => {
    const hay = `${parent ?? ""} ${label}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

function render(resetActive = false) {
  filtered = currentList();
  const level = stack[stack.length - 1];
  if (resetActive) {
    const current = filtered.findIndex(({ item }) => item.configKey && config[item.configKey] === item.configValue);
    activeIndex = level.title && current >= 0 ? current : 0;
  }
  activeIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));
  $("#commandInput").placeholder = level.title ? `${level.title}...` : "Type to search";
  $("#commandList").innerHTML = filtered.length
    ? filtered
        .map(({ item, label, parent }, i) => {
          const checked = item.configKey && config[item.configKey] === item.configValue;
          const icon = `<i class="fas ${checked ? "fa-check" : ""} fa-fw" aria-hidden="true"></i>`;
          const swatch = item.swatch
            ? `<div class="swatch" style="background:${item.swatch.bg}"><span style="background:${item.swatch.main}"></span><span style="background:${item.swatch.sub}"></span><span style="background:${item.swatch.text}"></span></div>`
            : "";
          const parentHtml = parent ? `<span class="parent">${esc(parent)}<i class="fas fa-chevron-right"></i></span>` : "";
          return `<div class="entry${i === activeIndex ? " active" : ""}" data-index="${i}">${icon}<span class="text">${parentHtml}${esc(label)}</span>${swatch}</div>`;
        })
        .join("")
    : `<div class="empty">Nothing found</div>`;
  scrollActiveIntoView();
  hoverActive();
}

function scrollActiveIntoView() {
  $("#commandList .entry.active")?.scrollIntoView({ block: "nearest" });
}

function hoverActive() {
  const entry = filtered[activeIndex];
  if (previewing) clearPreview();
  previewing = false;
  if (entry?.item.hover) {
    entry.item.hover();
    previewing = entry.item.configKey === "theme";
  }
}

function setActive(i) {
  if (!filtered.length) return;
  activeIndex = (i + filtered.length) % filtered.length;
  $$entries().forEach((el, idx) => el.classList.toggle("active", idx === activeIndex));
  scrollActiveIntoView();
  hoverActive();
}

const $$entries = () => [...document.querySelectorAll("#commandList .entry")];

function execute(index) {
  const entry = filtered[index];
  if (!entry) return;
  const { item } = entry;
  if (item.subgroup) {
    stack.push(item.subgroup);
    $("#commandInput").value = "";
    return render(true);
  }
  previewing = false;
  closeCommandLine();
  item.exec?.();
}

export function handleCommandLineKey(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    return closeCommandLine();
  }
  if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
    e.preventDefault();
    return setActive(activeIndex + 1);
  }
  if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
    e.preventDefault();
    return setActive(activeIndex - 1);
  }
  if (e.key === "Enter") {
    e.preventDefault();
    return execute(activeIndex);
  }
  if (e.key === "Backspace" && !$("#commandInput").value && stack.length > 1) {
    e.preventDefault();
    stack.pop();
    render(true);
  }
}

export function initCommandLine() {
  $("#commandInput").addEventListener("input", () => render(true));
  $("#commandList").addEventListener("mousemove", (e) => {
    const el = e.target.closest(".entry");
    if (el && +el.dataset.index !== activeIndex) setActive(+el.dataset.index);
  });
  $("#commandList").addEventListener("click", (e) => {
    const el = e.target.closest(".entry");
    if (el) execute(+el.dataset.index);
  });
  $("#commandLineWrapper").addEventListener("mousedown", (e) => {
    if (e.target.id === "commandLineWrapper") closeCommandLine();
  });
}
