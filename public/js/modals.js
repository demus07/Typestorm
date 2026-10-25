import { $, esc } from "./utils.js";
import { config, setConfig } from "./config.js";

let onClose = null;

export const isModalOpen = () => !$("#modalWrapper").classList.contains("hidden");

export function closeModal() {
  const wrap = $("#modalWrapper");
  if (wrap.classList.contains("hidden")) return;
  wrap.classList.add("hidden");
  $("#modal").innerHTML = "";
  const cb = onClose;
  onClose = null;
  cb?.();
  document.dispatchEvent(new CustomEvent("modal:closed"));
}

// onSubmit(form) may return false (or a promise of false) to keep the modal open.
export function openModal({ title, body, submitLabel = "ok", onSubmit, afterClose }) {
  const modal = $("#modal");
  modal.setAttribute("aria-label", title);
  modal.innerHTML = `
    <form class="modalForm" novalidate>
      <div class="title">${esc(title)}</div>
      ${body}
      <button type="submit" class="button primary">${esc(submitLabel)}<span class="arrow" aria-hidden="true">→</span></button>
    </form>`;
  onClose = afterClose ?? null;
  $("#modalWrapper").classList.remove("hidden");
  const form = modal.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const keepOpen = (await onSubmit?.(form)) === false;
    if (!keepOpen) closeModal();
  });
  form.querySelector("input, textarea")?.focus();
  form.querySelector("input, textarea")?.select?.();
  return form;
}

export function openCustomAmountModal(kind) {
  const isTime = kind === "time";
  openModal({
    title: isTime ? "test duration" : "word amount",
    body: `
      <input type="text" name="amount" inputmode="${isTime ? "text" : "numeric"}" value="${isTime ? config.time : config.words}" />
      <div class="hint">${isTime ? "Duration in seconds. You can also use units, e.g. 2m or 1h30m." : "How many words the test should have."}</div>`,
    onSubmit: (form) => {
      const raw = form.amount.value.trim();
      const n = isTime ? parseDuration(raw) : parseInt(raw);
      if (!Number.isInteger(n) || n < 1 || n > (isTime ? 10800 : 10000)) return false;
      setConfig(isTime ? "time" : "words", n);
      if (config.mode !== kind) setConfig("mode", kind);
    },
  });
}

function parseDuration(str) {
  if (/^\d+$/.test(str)) return parseInt(str);
  const m = str.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/);
  if (!m || !str) return NaN;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

export function openCustomTextModal() {
  openModal({
    title: "custom text",
    submitLabel: "apply",
    body: `
      <textarea name="text" rows="7" spellcheck="false" placeholder="paste or type your text here">${esc(config.customText)}</textarea>
      <label class="checkbox"><input type="checkbox" name="shuffle" ${config.customTextShuffle ? "checked" : ""} /><span class="box" aria-hidden="true"></span>Shuffle words</label>
      <div class="row"><span>Word limit</span><input type="number" name="limit" min="0" max="10000" value="${config.customTextLimit}" /></div>
      <div class="hint">With a word limit above 0, words are picked randomly from your text until the limit is reached.</div>`,
    onSubmit: (form) => {
      const text = form.text.value.replace(/\s+/g, " ").trim();
      if (!text) return false;
      setConfig("customTextShuffle", form.shuffle.checked);
      setConfig("customTextLimit", Math.max(0, Math.min(10000, parseInt(form.limit.value) || 0)));
      setConfig("customText", text);
      if (config.mode !== "custom") setConfig("mode", "custom");
    },
  });
}

export function confirmPassword({ title, submitLabel, onConfirm }) {
  openModal({
    title,
    submitLabel,
    body: `<input type="password" name="password" placeholder="password" autocomplete="current-password" />
           <div class="hint">This cannot be undone.</div>`,
    onSubmit: async (form) => {
      if (!form.password.value) return false;
      return onConfirm(form.password.value);
    },
  });
}

export function confirmAction({ title, text, submitLabel, onConfirm }) {
  openModal({ title, submitLabel, body: `<div class="text">${esc(text)}</div>`, onSubmit: onConfirm });
}
