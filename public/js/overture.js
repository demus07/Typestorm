import { $, sleep } from "./utils.js";

// The opening sequence: keycaps press out the name while the wordmark types
// itself, then the word settles into the header logo. Plays once per session
// (the boot script in index.ejs decides), and any key or click skips it.

// Milliseconds before each key: an uneven, human rhythm with a breath between "type" and "storm".
const RHYTHM = [0, 120, 105, 140, 240, 110, 125, 100, 135];

// The page rises in behind the sequence, and on every fresh load.
function arrive() {
  document.body.classList.add("arrive");
  setTimeout(() => document.body.classList.remove("arrive"), 1400);
}

export function playOverture() {
  const html = document.documentElement;
  const root = $("#overture");
  if (!root || html.classList.contains("noOverture")) return arrive();
  try {
    sessionStorage.setItem("typestorm-overture", "1");
  } catch {}

  const keys = [...root.querySelectorAll(".keycap")];
  const word = root.querySelector(".ovWord");
  const typed = root.querySelector(".typed");
  const timers = [];
  let left = false;

  const skip = (e) => {
    e.preventDefault();
    e.stopPropagation();
    leave();
  };
  window.addEventListener("keydown", skip, true);
  window.addEventListener("pointerdown", skip, true);

  // Wait briefly for the display face so the word doesn't swap fonts mid-sequence.
  Promise.race([document.fonts?.ready, sleep(900)]).then(() => {
    if (left) return;
    let t = 450; // let the keys settle in first
    keys.forEach((key, i) => {
      t += RHYTHM[i];
      timers.push(
        setTimeout(() => {
          key.classList.add("down");
          typed.textContent += key.textContent;
          setTimeout(() => key.classList.replace("down", "struck"), 90);
        }, t)
      );
    });
    timers.push(setTimeout(() => root.querySelector(".tagline").classList.add("show"), t + 280));
    timers.push(setTimeout(leave, t + 1150));
  });

  function leave() {
    if (left) return;
    left = true;
    timers.forEach(clearTimeout);
    window.removeEventListener("keydown", skip, true);
    window.removeEventListener("pointerdown", skip, true);

    typed.textContent = "typestorm";
    const from = typed.getBoundingClientRect();
    const box = word.getBoundingClientRect();
    const to = $("#logo .wordmark").getBoundingClientRect();
    // Scale around the word's own corner, then move that corner onto the logo.
    word.style.transformOrigin = `${from.left - box.left}px ${from.top - box.top}px`;
    root.classList.add("leaving");
    word.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})`;
    arrive();
    setTimeout(() => html.classList.add("noOverture"), 820);
  }
}
