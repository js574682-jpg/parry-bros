# Parry Bros

A parry-timing roguelike in a single file: `index.html`. That file holds all the
HTML, CSS, embedded art and fonts, and one big script wrapped in `(() => { ... })()`.

## Read first

- **`docs/STORY.md`** is the creator's full plan: chapters, bosses, the Orc
  King, cutscenes, endings, unlocks. Read it before any story, boss, chapter or
  reward work. When the creator decides something, update it in the same
  change. Items marked **Open** are undecided, so ask instead of inventing.
- The creator also edits the game in other tools (e.g. Codex, ChatGPT). New
  versions may arrive as an uploaded HTML file. Compare an upload against
  `index.html` before replacing it, so fixes already in the repo aren't lost.

## Working on the code

- Everything is in one script scope; functions and state (`run`, `meta`, `mode`)
  are shared globals inside it. Grep for a name before adding one.
- Lines can be very long (embedded base64 art, fonts, SVG icon tables). Search
  instead of reading whole regions; avoid printing those lines.
- Saves live in `localStorage` (3 slots plus a `-backup` copy each, a separate
  dev-mode save, and an in-progress climb in `meta.activeRun`). Anything read
  from a save or backup file must be validated. Use `own(table, key)` (not
  `table[key]`) when checking a name that came from save data.

## Tests

`npm test` (after `npm install` and `npx playwright install chromium`) runs:

- `tests/regressions.mjs`: one browser check per fixed bug.
- `tests/random-play.mjs`: random clicking and playing on desktop and phone
  screens; it fails on any game error and prints the steps before it.

Set `CHROMIUM_PATH` to use an existing Chromium. `npm test -- 10` shortens
random play. GitHub Actions runs the tests on every push
(`.github/workflows/test.yml`).

When you fix a bug, add a check for it to `tests/regressions.mjs`. Run the
tests before pushing.

## Dev mode

Dev mode (infinite currency on a separate save) is hidden from players. Tap the
title logo 5 times quickly to show its button.

## Repo

The default branch is `claude/github-cloud-usage-w116s6`.
