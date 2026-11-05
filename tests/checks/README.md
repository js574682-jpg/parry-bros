# Feature checks

Each `.mjs` file here is one feature's browser checks. `npm test` runs them all;
`npm test -- --only=<name>` runs just the files whose names contain `<name>`.

```js
// tests/checks/my-feature.mjs
export default async ({ check, expect, fresh, PHONE, DESKTOP }) => {
  await check('What this proves', async () => {
    const g = await fresh(PHONE);            // a fresh game page, empty save storage
    await g.run("useSlot(0); beginRun();");  // run code inside the game's script scope
    expect(await g.run('run.floor'), 1, 'starting floor');
    expect(g.errors.length, 0, 'page errors: ' + g.errors.join(' | '));
    await g.context.close();
  });
};
```
