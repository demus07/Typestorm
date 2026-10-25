import { $ } from "../utils.js";
import { api } from "../api.js";
import { auth } from "../auth.js";
import { notify } from "../notifications.js";
import { navigate } from "../router.js";
import { syncAccountConfig } from "../config.js";

async function submit(form, url, body) {
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const { user } = await api.post(url, body);
    auth.set(user);
    await syncAccountConfig();
    form.reset();
    navigate("/account");
    return user;
  } catch (err) {
    notify(err.message, "bad");
  } finally {
    button.disabled = false;
  }
}

export function initLogin() {
  $("#pageLogin").addEventListener("click", (e) => {
    const sw = e.target.closest("[data-auth-switch]");
    if (sw) showForm(sw.dataset.authSwitch);
  });

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const user = await submit(f, "/api/auth/login", {
      username: f.username.value.trim(),
      password: f.password.value,
      remember: f.remember.checked,
    });
    if (user) notify(`Signed in as ${user.username}`, "good");
  });

  $("#registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const username = f.username.value.trim();
    if (!/^[a-zA-Z0-9_.-]{3,16}$/.test(username)) {
      return notify("Username must be 3-16 characters: letters, numbers, _ . -", "bad");
    }
    if (f.password.value.length < 8) return notify("Password must be at least 8 characters long", "bad");
    if (f.password.value !== f.verifyPassword.value) return notify("Passwords do not match", "bad");
    const user = await submit(f, "/api/auth/register", { username, password: f.password.value });
    if (user) notify("Account created", "good");
  });
}

function showForm(which) {
  const register = which === "register";
  $("#loginForm").classList.toggle("hidden", register);
  $("#registerForm").classList.toggle("hidden", !register);
  $(`#${register ? "registerForm" : "loginForm"} input[name=username]`).focus();
}

export function onShowLogin() {
  setTimeout(() => showForm("login"), 150);
}
