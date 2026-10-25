// Each theme is four colours: base, text, accent, error. Every other shade is
// derived from text-over-base, so hierarchy comes from one colour at different strengths.
// [bg, text, accent, error]
const RAW = {
  storm: ["#16151f", "#e3e6f0", "#8fb3ff", "#ef7d86"],
  squall: ["#f2f0ea", "#1c1b26", "#3554d1", "#c43d4b"],
  kiln: ["#1c1a19", "#efe9e2", "#e58b62", "#e5566b"],
  moss: ["#161c18", "#e2e8de", "#9fd18b", "#e5776f"],
  harbor: ["#0f1d24", "#dbe9ee", "#5fc3c8", "#ef7f7f"],
  dusk: ["#1f1724", "#f0e4ee", "#f0a6ca", "#ff7a85"],
  ledger: ["#fbfbf8", "#141414", "#1f6f5c", "#c2333f"],
  vellum: ["#efe6d6", "#2b241c", "#2f5d8a", "#b3261e"],
  signal: ["#0c0c0c", "#e8e8e8", "#c8ff5a", "#ff6b6b"],
  fog: ["#e4e8ec", "#1e2833", "#4a6fa5", "#c0392b"],
  contrast: ["#000000", "#ffffff", "#ffd400", "#ff4d4d"],
};

export const DEFAULT_THEME = "storm";

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) =>
  "#" + hex(a).map((v, i) => Math.round(v * t + hex(b)[i] * (1 - t)).toString(16).padStart(2, "0")).join("");

export const THEMES = Object.fromEntries(
  Object.entries(RAW).map(([name, [bg, text, accent, error]]) => [
    name,
    {
      bg,
      text,
      main: accent,
      caret: accent,
      sub: mix(text, bg, 0.58),
      line: mix(text, bg, 0.14),
      subAlt: mix(text, bg, 0.06),
      error,
      errorExtra: mix(error, bg, 0.55),
    },
  ])
);
export const THEME_NAMES = Object.keys(THEMES);

const VAR_NAMES = {
  bg: "--bg-color",
  main: "--main-color",
  caret: "--caret-color",
  sub: "--sub-color",
  line: "--line-color",
  subAlt: "--sub-alt-color",
  text: "--text-color",
  error: "--error-color",
  errorExtra: "--error-extra-color",
};

let applied = null;

function setVars(theme) {
  const root = document.documentElement;
  const vars = {};
  for (const [key, cssVar] of Object.entries(VAR_NAMES)) {
    root.style.setProperty(cssVar, theme[key]);
    vars[cssVar] = theme[key];
  }
  try {
    localStorage.setItem("typestorm-theme-vars", JSON.stringify(vars));
  } catch {}
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.bg);
  updateFavicon(theme);
}

export function applyTheme(name) {
  const known = THEMES[name] ? name : DEFAULT_THEME;
  applied = known;
  setVars(THEMES[known]);
  const label = document.querySelector("#footerThemeName");
  if (label) label.textContent = known;
}

export function previewTheme(name) {
  if (THEMES[name]) setVars(THEMES[name]);
}

export function clearPreview() {
  if (applied) setVars(THEMES[applied]);
}

// The brand mark: a forward-leaning caret. It recurs as the typing caret,
// section markers, the active state and the progress line.
export const logoSvg = (fill = "currentColor") => `
<svg viewBox="0 0 20 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <polygon points="9,0 20,0 11,32 0,32" fill="${fill}"/>
</svg>`;

function updateFavicon(theme) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${theme.bg}"/><polygon points="31,12 45,12 33,52 19,52" fill="${theme.main}"/></svg>`;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.append(link);
  }
  link.href = "data:image/svg+xml," + encodeURIComponent(svg);
}
