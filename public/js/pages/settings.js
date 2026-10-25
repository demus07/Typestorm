import { $, $$, esc } from "../utils.js";
import { config, setConfig, subscribe, applyConfig, DEFAULTS } from "../config.js";
import { THEMES, THEME_NAMES, previewTheme, clearPreview } from "../themes.js";
import { LANGUAGES, languageDisplay } from "../words.js";
import { CLICK_SOUNDS, ERROR_SOUNDS, previewSound } from "../sound.js";
import { FONT_FAMILIES } from "../fonts.js";
import { auth } from "../auth.js";
import { api } from "../api.js";
import { notify } from "../notifications.js";
import { confirmAction, confirmPassword, openModal } from "../modals.js";
import { navigate } from "../router.js";

const onOff = [false, true];
const label = (v) => (typeof v === "boolean" ? (v ? "on" : "off") : String(v));

const SECTIONS = [
  {
    id: "behavior",
    icon: "fa-cogs",
    settings: [
      { key: "difficulty", icon: "fa-star", options: ["normal", "expert", "master"], desc: "Normal is the regular typing test. Expert ends the test as soon as you submit a word containing a mistake. Master ends it on the very first wrong keypress, so only 100% accuracy survives." },
      { key: "quickRestart", title: "quick restart", icon: "fa-redo-alt", options: ["off", "tab", "esc", "enter"], desc: "Restart the test with a single key instead of tab then enter. Choosing esc moves the command line to the tab key." },
      { key: "blindMode", title: "blind mode", icon: "fa-eye-slash", options: onOff, desc: "Hides your mistakes while you type - no red letters and no extra characters. Errors still count in the result." },
      { key: "language", icon: "fa-language", options: LANGUAGES, format: languageDisplay, desc: "The word list used in time and words mode." },
    ],
  },
  {
    id: "input",
    icon: "fa-keyboard",
    settings: [
      { key: "freedomMode", title: "freedom mode", icon: "fa-feather-alt", options: onOff, desc: "Lets you backspace into any previous word, even ones you typed correctly." },
      { key: "strictSpace", title: "strict space", icon: "fa-minus", options: onOff, desc: "Pressing space at the start of a word types a space character (counted as a mistake) instead of being ignored." },
      { key: "confidenceMode", title: "confidence mode", icon: "fa-backspace", options: ["off", "on", "max"], desc: "On stops you from going back to previous words. Max disables backspace entirely." },
      { key: "stopOnError", title: "stop on error", icon: "fa-hand-paper", options: ["off", "word", "letter"], desc: "Letter mode blocks input on any wrong letter until you type the right one. Word mode won't let you move to the next word until the current one is correct." },
      { key: "indicateTypos", title: "indicate typos", icon: "fa-exclamation", options: ["off", "below", "replace"], desc: "Shows the letter you actually typed - either underneath the expected letter, or in its place." },
    ],
  },
  {
    id: "sound",
    icon: "fa-volume-up",
    settings: [
      { key: "soundVolume", title: "sound volume", icon: "fa-volume-down", options: [0.1, 0.25, 0.5, 0.75, 1], format: (v) => `${v * 100}%`, desc: "Volume of all sound effects." },
      { key: "playSoundOnClick", title: "play sound on click", icon: "fa-volume-up", options: CLICK_SOUNDS, preview: "click", desc: "Plays a short sound every time you press a key." },
      { key: "playSoundOnError", title: "play sound on error", icon: "fa-volume-mute", options: ERROR_SOUNDS, preview: "error", desc: "Plays a sound when you press an incorrect key." },
    ],
  },
  {
    id: "caret",
    icon: "fa-i-cursor",
    settings: [
      { key: "caretStyle", title: "caret style", icon: "fa-i-cursor", options: ["off", "default", "block", "outline", "underline"], desc: "Changes the shape of the caret in the typing test." },
      { key: "smoothCaret", title: "smooth caret", icon: "fa-i-cursor", options: onOff, desc: "Animates the caret between letters instead of jumping." },
      { key: "paceCaret", title: "pace caret", icon: "fa-tachometer-alt", options: ["off", "pb", "last", "custom"], desc: "Shows a second caret moving at a constant speed - your personal best for the current mode, your last result, or a custom wpm." },
      { key: "paceCaretCustomSpeed", title: "pace caret speed", icon: "fa-tachometer-alt", options: [60, 80, 100, 120, 150, 200], format: (v) => `${v} wpm`, desc: "Speed of the pace caret when it is set to custom." },
    ],
  },
  {
    id: "appearance",
    icon: "fa-paint-brush",
    settings: [
      { key: "timerStyle", title: "timer/progress style", icon: "fa-clock", options: ["off", "mini", "bar", "text"], desc: "How the remaining time (or word progress) is shown during a test." },
      { key: "liveWpm", title: "live wpm", icon: "fa-tachometer-alt", options: onOff, desc: "Shows your current speed while typing." },
      { key: "liveAcc", title: "live accuracy", icon: "fa-percentage", options: onOff, desc: "Shows your current accuracy while typing." },
      { key: "smoothLineScroll", title: "smooth line scroll", icon: "fa-align-left", options: onOff, desc: "Animates the words sliding up when you move to a new line." },
      { key: "fontSize", title: "font size", icon: "fa-font", options: [1, 1.25, 1.5, 2, 2.5, 3, 4], desc: "Size of the words in the typing test." },
      { key: "keymapMode", title: "keymap", icon: "fa-keyboard", options: ["off", "static", "react", "next"], desc: "Displays an on-screen keyboard below the words. React flashes the keys you press, next highlights the key you need to press." },
      { key: "fontFamily", title: "font family", icon: "fa-font", options: FONT_FAMILIES, wide: true, font: true, desc: "The typeface of the words you type. The rest of the interface keeps its own type." },
    ],
  },
  { id: "theme", icon: "fa-palette", custom: "theme" },
  {
    id: "hide elements",
    icon: "fa-eye-slash",
    settings: [
      { key: "showKeyTips", title: "key tips", icon: "fa-question", options: onOff, desc: "Shows keyboard shortcut hints at the bottom of the page." },
      { key: "showOutOfFocusWarning", title: "out of focus warning", icon: "fa-mouse-pointer", options: onOff, desc: "Blurs the words and shows a warning when the test loses focus." },
      { key: "capsLockWarning", title: "caps lock warning", icon: "fa-lock", options: onOff, desc: "Shows a warning while caps lock is on." },
    ],
  },
  { id: "danger zone", icon: "fa-exclamation-triangle", custom: "danger" },
];

const SECTION_TITLES = {
  behavior: "Behaviour",
  input: "Input",
  sound: "Sound",
  caret: "Caret",
  appearance: "Appearance",
  theme: "Theme",
  "hide elements": "Visibility",
  "danger zone": "Data and account",
};
const num = (i) => String(i + 1).padStart(2, "0");

function settingRow({ id, title, desc, search, options, wide }) {
  return `
    <div class="setting${wide ? " wide" : ""}"${id ? ` id="${id}"` : ""} data-search="${esc((search ?? `${title} ${desc}`).toLowerCase())}">
      <div class="settingText">
        <div class="settingTitle">${esc(title)}</div>
        <div class="desc">${esc(desc)}</div>
      </div>
      <div class="options">${options}</div>
    </div>`;
}

function settingMarkup(s) {
  const fmt = s.format ?? label;
  const options = s.options
    .map((v, i) => {
      const style = s.font ? ` style="font-family:'${esc(v)}', var(--font-ui)"` : "";
      return `<button type="button" class="opt" data-key="${s.key}" data-index="${i}" aria-pressed="false"${style}>${esc(fmt(v))}</button>`;
    })
    .join("");
  return settingRow({ title: s.title ?? s.key, desc: s.desc, options, wide: s.wide });
}

function themeMarkup() {
  const buttons = THEME_NAMES.map((name) => {
    const t = THEMES[name];
    return `<button type="button" class="themeButton" data-theme="${esc(name)}" aria-pressed="false" style="background:${t.bg};color:${t.text}">
      <span class="name">${esc(name)}</span>
      <span class="dots" aria-hidden="true"><span class="bar" style="background:${t.main}"></span><span style="background:${t.text}"></span><span style="background:${t.sub}"></span><span style="background:${t.error}"></span></span>
    </button>`;
  }).join("");
  return `
    <div class="setting wide" data-search="theme colours colors">
      <div class="settingText">
        <div class="settingTitle">Colour theme</div>
        <div class="desc">Hover to preview, click to apply. Each theme is one base, one text colour and one accent.</div>
      </div>
      <div class="themes">${buttons}</div>
    </div>`;
}

function dangerMarkup() {
  const account = auth.user
    ? settingRow({
        id: "account",
        title: "Reset account",
        desc: "Deletes all of your results and resets your stats. Your account and settings stay.",
        options: `<button type="button" class="button danger" data-action="resetAccount">Reset account</button>`,
      }) +
      settingRow({
        title: "Delete account",
        desc: "Permanently deletes your account and every result attached to it.",
        options: `<button type="button" class="button danger" data-action="deleteAccount">Delete account</button>`,
      })
    : "";
  return (
    settingRow({
      title: "Import or export settings",
      desc: "Copy your settings as JSON, or paste settings exported from another browser.",
      options: `<div class="actions"><button type="button" class="textLink" data-action="export">Copy settings</button><button type="button" class="textLink" data-action="import">Paste settings</button></div>`,
    }) +
    settingRow({
      title: "Reset settings",
      desc: "Returns every setting to its default value.",
      options: `<button type="button" class="button danger" data-action="resetSettings">Reset settings</button>`,
    }) +
    account
  );
}

function render() {
  const page = $("#pageSettings");
  page.querySelector(".sectionNav").innerHTML = SECTIONS.map(
    (s, i) => `<button type="button" data-jump="${esc(s.id)}"><span class="n">${num(i)}</span>${esc(SECTION_TITLES[s.id])}</button>`
  ).join("");
  page.querySelector(".sections").innerHTML = SECTIONS.map((s, i) => {
    const body = s.custom === "theme" ? themeMarkup() : s.custom === "danger" ? dangerMarkup() : s.settings.map(settingMarkup).join("");
    return `<section class="section" id="${s.id === "caret" ? "caret-settings" : esc(s.id.replace(/ /g, "-"))}" data-section="${esc(s.id)}" aria-labelledby="sec-${i}">
      <h2 class="sectionHead" id="sec-${i}">${esc(SECTION_TITLES[s.id])}</h2>
      <div class="sectionBody">${body}</div>
    </section>`;
  }).join("");
  updateActive();
}

const findSetting = (key) => SECTIONS.flatMap((s) => s.settings ?? []).find((s) => s.key === key);

function updateActive() {
  $$("#pageSettings .opt[data-key]").forEach((b) => {
    const s = findSetting(b.dataset.key);
    const on = config[s.key] === s.options[+b.dataset.index];
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on);
  });
  $$("#pageSettings .themeButton").forEach((b) => {
    const on = b.dataset.theme === config.theme;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on);
  });
}

async function handleAction(action) {
  if (action === "export") {
    try {
      await navigator.clipboard.writeText(JSON.stringify(config));
      notify("Settings copied to clipboard", "good");
    } catch {
      notify("Could not access the clipboard", "bad");
    }
  } else if (action === "import") {
    openModal({
      title: "import settings",
      submitLabel: "import",
      body: `<textarea name="json" rows="6" spellcheck="false" placeholder="paste exported settings"></textarea>`,
      onSubmit: (form) => {
        try {
          applyConfig(JSON.parse(form.json.value));
          notify("Settings imported", "good");
        } catch {
          notify("That doesn't look like valid settings JSON", "bad");
          return false;
        }
      },
    });
  } else if (action === "resetSettings") {
    confirmAction({
      title: "reset settings",
      text: "Are you sure you want to reset all settings to their defaults?",
      submitLabel: "reset",
      onConfirm: () => {
        applyConfig(DEFAULTS);
        notify("Settings reset", "good");
      },
    });
  } else if (action === "resetAccount" || action === "deleteAccount") {
    const del = action === "deleteAccount";
    confirmPassword({
      title: del ? "delete account" : "reset account",
      submitLabel: del ? "delete" : "reset",
      onConfirm: async (password) => {
        try {
          await api.post(del ? "/api/account/delete" : "/api/account/reset", { password });
          notify(del ? "Account deleted" : "Account reset", "good");
          if (del) {
            auth.set(null);
            navigate("/");
          }
        } catch (err) {
          notify(err.message, "bad");
          return false;
        }
      },
    });
  }
}

export function initSettings() {
  const page = $("#pageSettings");
  page.addEventListener("click", (e) => {
    const opt = e.target.closest(".opt[data-key]");
    if (opt) {
      const s = findSetting(opt.dataset.key);
      const value = s.options[+opt.dataset.index];
      if (s.preview) previewSound(s.preview, value);
      setConfig(s.key, value);
      return;
    }
    const theme = e.target.closest(".themeButton");
    if (theme) return setConfig("theme", theme.dataset.theme);
    const jump = e.target.closest("[data-jump]");
    if (jump) return page.querySelector(`[data-section="${jump.dataset.jump}"]`)?.scrollIntoView({ behavior: "smooth" });
    const action = e.target.closest("[data-action]");
    if (action) handleAction(action.dataset.action);
  });
  page.addEventListener("mouseover", (e) => {
    const theme = e.target.closest(".themeButton");
    if (theme) previewTheme(theme.dataset.theme);
  });
  page.addEventListener("mouseout", (e) => {
    if (e.target.closest(".themeButton") && !e.relatedTarget?.closest?.(".themeButton")) clearPreview();
  });
  $("#settingsSearch").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$("#pageSettings .setting").forEach((el) => el.classList.toggle("hidden", !!q && !el.dataset.search.includes(q)));
    $$("#pageSettings .section").forEach((sec) =>
      sec.classList.toggle("hidden", !!q && !sec.querySelector(".setting:not(.hidden)"))
    );
  });
  subscribe(() => updateActive());
  auth.onChange(() => render());
  render();
}

export function onShowSettings() {
  updateActive();
}
