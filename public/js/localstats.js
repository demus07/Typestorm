// Personal bests and the last result, kept in the browser so the pace caret
// works for signed-out users too. Signed-in users get these seeded from the server.
const KEY = "typestorm-local-stats";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { pbs: {}, last: null };
  } catch {
    return { pbs: {}, last: null };
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

export const pbKey = (s) => [s.mode, s.mode2, s.punctuation ? 1 : 0, s.numbers ? 1 : 0, s.language].join("|");

export function getLocalPb(settings) {
  return load().pbs[pbKey(settings)] ?? null;
}

export function getLastWpm() {
  return load().last;
}

export function recordLocalResult(settings, wpm) {
  const data = load();
  data.last = wpm;
  if (settings.mode === "time" || settings.mode === "words") {
    const key = pbKey(settings);
    if (!(data.pbs[key] >= wpm)) data.pbs[key] = wpm;
  }
  save(data);
}

// pbList = [{ mode, mode2, punctuation, numbers, language, wpm }] from the profile endpoint.
export function seedFromProfile(pbList) {
  const data = load();
  for (const pb of pbList ?? []) {
    const key = pbKey({ ...pb, language: pb.language ?? "english" });
    if (!(data.pbs[key] >= pb.wpm)) data.pbs[key] = pb.wpm;
  }
  save(data);
}
