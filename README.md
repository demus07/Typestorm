# Typestorm

A minimalistic, customizable typing test inspired by [monkeytype](https://github.com/monkeytypegame/monkeytype).

- **Test modes:** time (15/30/60/120/custom), words (10/25/50/100/custom), quote (short → thicc), zen, custom text. Punctuation and numbers can be toggled on.
- **Feel:** smooth caret, 3-line scrolling word box, live timer, UI fades out while you type, error underlines, extra letters, a "click to focus" blur, tab + enter to restart.
- **Results:** wpm, raw, accuracy, consistency, character stats, a per-second chart with errors, input history, replay, practice missed words, and a screenshot copied to the clipboard.
- **Command line:** `esc` or `ctrl/cmd + shift + p` reaches every setting, including live theme preview.
- **Settings:** 11 colour themes, 14 typing fonts, caret styles, pace caret, keymap, sounds, difficulty (normal/expert/master), blind/freedom/confidence modes, stop on error, and more. Settings are stored locally and synced to your account.
- **Accounts:** results history, personal bests, stats, public profiles, all-time and daily leaderboards (English time 15 / 30 / 60).

## Running locally

Requires Node 20.12+ and MongoDB.

```sh
npm install
cp .env.example .env   # then edit MONGO_URI and SESSION_SECRET
npm run dev            # http://localhost:3000
```

| variable         | purpose                                   |
| ---------------- | ----------------------------------------- |
| `MONGO_URI`      | MongoDB connection string                 |
| `SESSION_SECRET` | long random string used to sign sessions  |
| `PORT`           | optional, defaults to 3000                |
| `NODE_ENV`       | set to `production` for secure cookies    |

Results saved by the original version of the app (accuracy stored as `"98%"`) are migrated automatically on startup.

## Structure

```
index.js              Express server: auth, results, leaderboards, profiles, config sync
views/index.ejs       single-page app shell (all pages live here)
public/css/style.css  all styles, themed through CSS variables
public/js/main.js     entry point: global keybinds, page registration
public/js/test.js     typing engine (input, caret, scrolling, timer, stats)
public/js/results.js  results screen, chart, replay, screenshot
public/js/...         router, command line, config, themes, words, quotes, sounds, pages/
public/languages/     word lists loaded on demand
```
