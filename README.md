# Parry Bros

The whole game is one file, `index.html`. Open it in a browser to play.

## Tests

Every push to GitHub runs the tests automatically (the **Actions** tab shows the
results; a red X on a commit or pull request means something broke). They:

- check each bug that has been fixed, so it can't quietly come back, and
- play the game randomly on a desktop and a phone-sized screen and fail if the
  game throws any error.

To run them on your own computer you need [Node.js](https://nodejs.org). Then,
in this folder:

```
npm install
npx playwright install chromium
npm test
```

`npm test -- 10` runs a shorter 10-second random-play round.

## Developer tools

Dev mode (infinite currency on a separate save) is hidden from players. Tap the
logo on the title screen 5 times quickly to show or hide its button.
