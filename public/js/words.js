import { pick, randomInt } from "./utils.js";

// 200 of the most frequent English words.
const ENGLISH = `the be of and a to in he have it that for they with as not on she at by this we you do but
from or which one would all will there say who make when can more if no man out other so what time up go
about than into could state only new year some take come these know see use get like then first any work
now may such give over think most even find day also after way many must look before great back through
long where much should well people down own just because good each those feel seem how high too place
little world very still nation hand old life tell write become here show house both between need mean
call develop under last right move thing general school never same another begin while number part turn
real leave might want point form off child few small since against ask late home interest large person
end open public follow during present without again hold govern around possible head consider word
program problem however lead system set order eye plan run keep face fact group play stand increase early
course change help line`
  .split(/\s+/)
  .filter(Boolean);

export const LANGUAGES = ["english", "english_2k"];
const cache = { english: ENGLISH };

export const languageDisplay = (name) => name.replace(/_/g, " ");

export async function getWordList(name) {
  if (cache[name]) return cache[name];
  try {
    const res = await fetch(`/languages/${encodeURIComponent(name)}.json`);
    const data = await res.json();
    cache[name] = data.words;
  } catch {
    cache[name] = ENGLISH;
  }
  return cache[name];
}

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

function randomNumber() {
  const len = randomInt(1, 4);
  let n = String(randomInt(1, 9));
  for (let i = 1; i < len; i++) n += randomInt(0, 9);
  return n;
}

// Produces an endless stream of words, optionally sprinkled with punctuation and numbers.
export class WordGenerator {
  constructor(list, { punctuation = false, numbers = false } = {}) {
    this.list = list;
    this.punctuation = punctuation;
    this.numbers = numbers;
    this.prev = [];
    this.prevOutput = "";
  }

  rawWord() {
    let word;
    for (let tries = 0; tries < 20; tries++) {
      word = pick(this.list);
      if (!this.prev.includes(word) || this.list.length < 4) break;
    }
    this.prev = [word, ...this.prev].slice(0, 2);
    return word;
  }

  next(isLast = false) {
    let word = this.rawWord();
    if (this.numbers && Math.random() < 0.1) word = randomNumber();
    if (this.punctuation) word = this.punctuate(word, isLast);
    this.prevOutput = word;
    return word;
  }

  punctuate(word, isLast) {
    const sentenceStart = !this.prevOutput || /[.?!]$/.test(this.prevOutput);
    if (sentenceStart) word = cap(word);
    if (isLast) return word + ".";

    const r = Math.random();
    if (r < 0.1) return word + pick([".", ".", ".", "?", "!"]);
    if (r < 0.2) return word + ",";
    if (r < 0.23) return word + pick([";", ":"]);
    if (r < 0.25) return `"${word}"`;
    if (r < 0.27) return `(${word})`;
    if (r < 0.29 && !sentenceStart) return "-";
    return word;
  }

  generate(count) {
    return Array.from({ length: count }, () => this.next(false));
  }
}
