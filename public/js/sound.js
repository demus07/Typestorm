import { config } from "./config.js";

// All sounds are synthesized with WebAudio so there are no audio assets to ship.
let ctx = null;
const audio = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());

function envelope(node, gainValue, duration) {
  const c = audio();
  const gain = c.createGain();
  gain.gain.setValueAtTime(gainValue * config.soundVolume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
  node.connect(gain).connect(c.destination);
  return gain;
}

function tone(freq, duration, type = "sine", gain = 0.3, endFreq) {
  const c = audio();
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, c.currentTime + duration);
  envelope(osc, gain, duration);
  osc.start();
  osc.stop(c.currentTime + duration);
}

function noise(duration, filterFreq, gain = 0.5) {
  const c = audio();
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq * (0.9 + Math.random() * 0.2);
  filter.Q.value = 1.2;
  src.connect(filter);
  envelope(filter, gain, duration);
  src.start();
}

export const CLICK_SOUNDS = ["off", "click", "beep", "pop", "typewriter", "thock"];
export const ERROR_SOUNDS = ["off", "damage", "triangle", "square"];

const clickSounds = {
  click: () => noise(0.04, 3500, 0.9),
  beep: () => tone(880, 0.05, "sine", 0.2),
  pop: () => tone(600, 0.06, "sine", 0.35, 180),
  typewriter: () => (noise(0.05, 2200, 1), tone(140, 0.04, "square", 0.05)),
  thock: () => (noise(0.07, 700, 1.2), tone(110, 0.06, "sine", 0.3, 60)),
};
const errorSounds = {
  damage: () => tone(220, 0.15, "sawtooth", 0.15, 90),
  triangle: () => tone(330, 0.12, "triangle", 0.3, 160),
  square: () => tone(160, 0.1, "square", 0.08),
};

export function playClick() {
  if (config.playSoundOnClick === "off") return;
  try {
    clickSounds[config.playSoundOnClick]?.();
  } catch {}
}

export function playError() {
  if (config.playSoundOnError === "off") return;
  try {
    errorSounds[config.playSoundOnError]?.();
  } catch {}
}

export function previewSound(kind, name) {
  try {
    (kind === "error" ? errorSounds : clickSounds)[name]?.();
  } catch {}
}
