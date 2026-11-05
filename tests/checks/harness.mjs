// Proves the tests/checks/ runner itself works.
export default async ({ check, expect, fresh }) => {
  await check('Feature checks run and can reach the game', async () => {
    const g = await fresh();
    expect(await g.run("typeof startQte"), 'function', 'game scope reachable');
    await g.context.close();
  });
};
