import { api } from "./api.js";
import { esc } from "./utils.js";

const listeners = new Set();

export const auth = {
  user: window.__BOOT__?.user ?? null,
  onChange(fn) {
    listeners.add(fn);
  },
  set(user) {
    this.user = user;
    renderAccountButton();
    listeners.forEach((fn) => fn(user));
  },
  async logout() {
    await api.post("/api/auth/logout");
    this.set(null);
  },
};

export function renderAccountButton() {
  const mobile = document.querySelector("[data-account-link] span");
  if (mobile) mobile.textContent = auth.user ? "Account" : "Sign in";
  const wrap = document.querySelector("#accountButtonWrap");
  if (!wrap) return;
  if (!auth.user) {
    wrap.innerHTML = `<a href="/login" class="navCta" data-link>Sign in</a>`;
    return;
  }
  const name = esc(auth.user.username);
  wrap.innerHTML = `
    <a href="/account" class="accountButton" data-link aria-haspopup="true"><span class="avatar" aria-hidden="true">${esc(auth.user.username[0])}</span><span class="name">${name}</span></a>
    <div class="accountMenu">
      <a href="/account" data-link>Your stats</a>
      <a href="/profile/${encodeURIComponent(auth.user.username)}" data-link>Public profile</a>
      <a href="/settings#account" data-link>Account settings</a>
      <div class="sep"></div>
      <button type="button" data-action="logout">Sign out</button>
    </div>`;
}
