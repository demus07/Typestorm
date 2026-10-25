import { $, esc } from "./utils.js";
import { config } from "./config.js";

const ROWS = ["1234567890-=", "qwertyuiop[]", "asdfghjkl;'", "zxcvbnm,./"];
const SHIFTED = { "!": "1", "@": "2", "#": "3", $: "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", _: "-", "+": "=", "{": "[", "}": "]", ":": ";", '"': "'", "<": ",", ">": ".", "?": "/" };

const normalize = (ch) => {
  if (ch === " ") return " ";
  const lower = ch.toLowerCase();
  return SHIFTED[ch] ?? lower;
};

let keyEls = new Map();

export function renderKeymap() {
  const el = $("#keymap");
  if (!el) return;
  el.classList.toggle("hidden", config.keymapMode === "off");
  if (config.keymapMode === "off") return;
  el.innerHTML =
    ROWS.map(
      (row, r) =>
        `<div class="row r${r}">${[...row].map((k) => `<div class="key" data-key="${esc(k)}">${esc(k)}</div>`).join("")}</div>`
    ).join("") + `<div class="row"><div class="key space" data-key=" ">space</div></div>`;
  keyEls = new Map([...el.querySelectorAll(".key")].map((k) => [k.dataset.key, k]));
}

export function keymapPress(ch, correct) {
  if (config.keymapMode !== "react") return;
  const key = keyEls.get(normalize(ch));
  if (!key) return;
  key.classList.remove("flash", "flashError");
  void key.offsetWidth;
  key.classList.add(correct ? "flash" : "flashError");
}

export function keymapNext(ch) {
  if (config.keymapMode !== "next") return;
  keyEls.forEach((k) => k.classList.remove("next"));
  if (ch != null) keyEls.get(normalize(ch))?.classList.add("next");
}
