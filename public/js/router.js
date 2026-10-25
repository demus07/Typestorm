import { sleep } from "./utils.js";
import { auth } from "./auth.js";

const ROUTES = [
  { re: /^\/$/, page: "test", title: "typing test" },
  { re: /^\/settings$/, page: "settings", title: "settings" },
  { re: /^\/leaderboards$/, page: "leaderboards", title: "leaderboards" },
  { re: /^\/about$/, page: "about", title: "about" },
  { re: /^\/login$/, page: "login", title: "login", guest: true },
  { re: /^\/account$/, page: "account", title: "account", auth: true },
  { re: /^\/profile\/([^/]+)$/, page: "account", title: "profile", profile: true },
];

const pages = {}; // name -> { el, onShow?, onHide? }
let current = null;
let currentKey = null;
let transitionId = 0;

export function registerPage(name, handlers = {}) {
  pages[name] = { el: document.querySelector(`.page[data-page="${name}"]`), ...handlers };
}

function resolve(pathname) {
  for (const route of ROUTES) {
    const m = pathname.match(route.re);
    if (!m) continue;
    if (route.auth && !auth.user) return { redirect: "/login" };
    if (route.guest && auth.user) return { redirect: "/account" };
    const params = route.profile ? { profile: decodeURIComponent(m[1]) } : {};
    return { ...route, params };
  }
  return { page: "404", title: "404", params: {} };
}

export async function navigate(url, { replace = false, force = false } = {}) {
  const target = new URL(url, location.origin);
  const r = resolve(target.pathname);
  if (r.redirect) return navigate(r.redirect, { replace: true });

  const key = target.pathname;
  if (key + target.hash !== location.pathname + location.hash || replace) {
    history[replace ? "replaceState" : "pushState"]({}, "", target.pathname + target.search + target.hash);
  }
  // Clicking the active page again re-triggers it (e.g. the keyboard icon restarts the test).
  if (current === r.page && currentKey === key && !force) {
    pages[r.page]?.onReselect?.(r.params);
    scrollToHash(target.hash);
    return;
  }
  await show(r, key, target.hash);
}

function scrollToHash(hash) {
  if (!hash) return window.scrollTo({ top: 0 });
  document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function show(route, key, hash) {
  const id = ++transitionId;
  const prev = current ? pages[current] : null;
  const next = pages[route.page];
  document.title = `Typestorm | ${route.title}`;
  const navKey = route.page === "login" || (route.page === "account" && !route.profile) ? "/account" : key;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const on = a.getAttribute("href") === navKey;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });

  if (prev) {
    prev.el.classList.add("faded");
    await sleep(125);
    if (id !== transitionId) return;
    prev.el.classList.add("hidden");
    prev.el.classList.remove("faded");
    if (current !== route.page || currentKey !== key) prev.onHide?.();
  }
  current = route.page;
  currentKey = key;
  document.body.dataset.page = route.page;
  next.el.classList.add("faded");
  next.el.classList.remove("hidden");
  window.scrollTo({ top: 0 });
  next.onShow?.(route.params);
  void next.el.offsetWidth;
  next.el.classList.remove("faded");
  if (hash) setTimeout(() => scrollToHash(hash), 50);
}

export const currentPage = () => current;

export function initRouter() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === "_blank" || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.origin);
    if (url.origin !== location.origin || url.pathname.startsWith("/api")) return;
    e.preventDefault();
    a.blur();
    navigate(url.pathname + url.search + url.hash);
  });
  window.addEventListener("popstate", () => navigate(location.pathname + location.hash, { replace: true }));
  return navigate(location.pathname + location.search + location.hash, { replace: true, force: true });
}

