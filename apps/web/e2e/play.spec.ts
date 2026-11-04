import { expect, test, type Page } from '@playwright/test';

async function guess(page: Page, word: string) {
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
}

const panel = (page: Page) => page.getByRole('region', { name: 'Current entry' });
const clue = (page: Page, text: string) =>
  page.getByRole('region', { name: 'Clues' }).getByRole('button', { name: new RegExp(text) });

test.beforeEach(async ({ page }) => {
  // Each test is its own visitor to the API. Without Cloudflare in front (staging on 127.0.0.1,
  // npm run preview) every request would share one address, and the forms' per-address rate
  // limits would trip across runs. Addresses are from 192.0.2.0/24, the documentation range.
  const visitor = `192.0.2.${1 + Math.floor(Math.random() * 254)}`;
  await page.route('**/api/**', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'cf-connecting-ip': visitor } }),
  );
  // The sample puzzle, so the tests don't depend on today's date.
  await page.goto('/#sample');
  await expect(panel(page).getByRole('heading', { name: 'Flat and even' })).toBeVisible();
});

test('shows every clue', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Clues' }).getByRole('button')).toHaveCount(9);
});

test('rejects words that are not in the word list without using a guess', async ({ page }) => {
  await guess(page, 'LEVXL');
  await expect(panel(page).getByText('Not in the word list.')).toBeVisible();
  await expect(panel(page).getByText('18 of 18 guesses left')).toBeVisible();

  // The letters stay so the player can fix them.
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await guess(page, 'EL');
  await expect(clue(page, 'Flat and even')).toContainText('Solved in 1');
});

test('accepts newer words from the British list', async ({ page }) => {
  // EMAIL and PODCAST are in the SCOWL British list but not in ENABLE.
  await guess(page, 'EMAIL');
  await expect(panel(page).getByText('17 of 18 guesses left')).toBeVisible();
  await clue(page, 'Resolved, as a dispute').click();
  await guess(page, 'PODCAST');
  await expect(panel(page).getByText('16 of 18 guesses left')).toBeVisible();
});

test('lets a guess fish with other letters, and keeps greens off the grid', async ({ page }) => {
  await guess(page, 'EERIE'); // the second E is green
  const grid = page.getByRole('group', { name: /Crossword grid/ });
  await expect(grid.getByRole('button', { name: 'row 1, column 2, empty' })).toBeVisible();

  // The next guess starts empty, like Wordle, and can drop the green E.
  const next = panel(page).getByRole('listitem', { name: 'Current guess' });
  await expect(next).toHaveText('');
  await guess(page, 'TABLE');
  await expect(panel(page).getByText('16 of 18 guesses left')).toBeVisible();
  await expect(grid.getByRole('button', { name: 'row 1, column 2, empty' })).toBeVisible();

  // Solving the entry puts it on the grid.
  await guess(page, 'LEVEL');
  await expect(grid.getByRole('button', { name: 'row 1, column 2, E' })).toBeVisible();
});

test('badges green and yellow tiles whose letter the answer repeats', async ({ page }) => {
  await guess(page, 'EERIE');
  const row = panel(page).getByRole('listitem').first();
  await expect(row.getByLabel('E, in the word, the answer has 2 Es')).toHaveCount(1);
  await expect(row.getByLabel('E, correct, the answer has 2 Es')).toHaveCount(1);
  await expect(row.getByLabel('E, not in the word')).toHaveCount(1);
});

test('locks a solved entry into its crossings', async ({ page }) => {
  await guess(page, 'LEVEL');
  await expect(clue(page, 'Flat and even')).toContainText('Solved in 1');

  // The game moves on to the next clue in the list, 2 Across.
  await expect(panel(page).getByRole('heading', { name: 'Bottomless pit' })).toBeVisible();

  // 1 Down's first letter is now locked to L.
  await clue(page, 'Milky coffee order').click();
  await guess(page, 'LATTE');
  await expect(clue(page, 'Milky coffee order')).toContainText('Solved in 1');
});

test('never changes a solved answer on the grid', async ({ page }) => {
  await guess(page, 'LEVEL');
  // 1 Down crosses LEVEL's first L; MATTE puts an M there instead.
  await clue(page, 'Milky coffee order').click();
  await page.keyboard.type('M');
  const grid = page.getByRole('group', { name: /Crossword grid/ });
  const corner = grid.getByRole('button', { name: '1, row 1, column 1, L' });
  await expect(corner).toBeVisible();
  await guess(page, 'ATTE');
  await expect(panel(page).getByText('MATTE: 4 green, 0 yellow.')).toBeVisible();
  await expect(corner).toBeVisible();
  await expect(clue(page, 'Flat and even')).toContainText('Solved in 1');

  // Every cell of 1 Down is green now, but it's only solved by guessing the word itself.
  await expect(clue(page, 'Milky coffee order')).not.toContainText('Solved');
  await guess(page, 'LATTE');
  await expect(clue(page, 'Milky coffee order')).toContainText('Solved in 2');
});

test('sends the player id with guesses, and reports a restart to a server that keeps records', async ({
  page,
}) => {
  const scored = page.waitForRequest((r) => r.url().endsWith('/api/guess'));
  await guess(page, 'LEVEL');
  const id = (await scored).headers()['x-player-id'];
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await expect(clue(page, 'Flat and even')).toContainText('Solved in 1');

  // The same id after a reload, and on the restart report.
  await page.reload();
  const restarted = page.waitForRequest((r) => r.url().endsWith('/api/restart'));
  await page.getByRole('button', { name: 'Restart' }).click();
  await page.getByRole('button', { name: 'Restart' }).click();
  const report = await restarted;
  expect(report.headers()['x-player-id']).toBe(id);
  expect(report.postDataJSON()).toEqual({ puzzleId: 'sample' });
});

test('keeps progress after a reload, and restart clears it', async ({ page }) => {
  await guess(page, 'LEVEL');
  // Progress is saved once the server has scored the guess.
  await expect(clue(page, 'Flat and even')).toContainText('Solved in 1');
  await page.reload();
  await expect(clue(page, 'Flat and even')).toContainText('Solved in 1');

  await page.getByRole('button', { name: 'Restart' }).click();
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect(clue(page, 'Flat and even')).not.toContainText('Solved');
  await expect(page.getByText('0 of 9 solved')).toBeVisible();
});

const SECOND_CLUE = 'A position on a scale of intensity or amount or quality';

test('gets the Crossword clue from the server when revealed, and keeps it', async ({ page }) => {
  // The page only knows that 1A has a second clue; the server sends it.
  await expect(page.getByText(SECOND_CLUE)).toHaveCount(0);
  const sent = page.waitForResponse('**/api/clue');
  await panel(page).getByRole('button', { name: 'Crossword clue' }).click();
  await panel(page).getByRole('button', { name: 'Reveal' }).click();
  expect((await sent).status()).toBe(200);
  await expect(panel(page).getByText(SECOND_CLUE)).toBeVisible();
  await expect(clue(page, 'Flat and even')).toContainText(SECOND_CLUE);

  await page.reload();
  await expect(panel(page).getByText(SECOND_CLUE)).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Crossword clue' })).toHaveCount(0);
});

test('still shows a Crossword clue revealed by an older version of the page', async ({ page }) => {
  // Older versions had every second clue in the puzzle, and saved only which were shown.
  await page.evaluate(() =>
    localStorage.setItem(
      'crosswordle:game:sample',
      JSON.stringify({ puzzleId: 'sample', guesses: {}, crosswordClues: ['1A'] }),
    ),
  );
  await page.reload();
  await expect(panel(page).getByText(SECOND_CLUE)).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Crossword clue' })).toHaveCount(0);
});

test('starts fresh when saved progress no longer fits the puzzle', async ({ page }) => {
  // Guesses saved for an earlier version of the puzzle, where 1A had a different length.
  await page.evaluate(() =>
    localStorage.setItem(
      'crosswordle:game:sample',
      JSON.stringify({ puzzleId: 'sample', guesses: { '1A': ['LEVELS'] } }),
    ),
  );
  await page.reload();
  await expect(panel(page).getByText('18 of 18 guesses left')).toBeVisible();
});

test('tells the player what a guess found', async ({ page }) => {
  await guess(page, 'EERIE');
  await expect(panel(page).getByText('EERIE: 1 green, 1 yellow.')).toBeVisible();
});

/** Solves the sample puzzle in nine guesses, in clue-list order (every Across, then every Down). */
async function solveSample(page: Page) {
  const words = ['LEVEL', 'ABYSS', 'EXTRA', 'HELLO', 'LATTE', 'VALET', 'LLAMA', 'SETTLED', 'ODD'];
  for (const [i, word] of words.entries()) {
    await guess(page, word);
    // Keys are ignored while a guess is being scored, so wait for it before typing the next.
    await expect(page.getByText(`${i + 1} of 9 solved`)).toBeVisible();
  }
}

test('shows stats and a spoiler-free result when the puzzle ends', async ({ page }) => {
  await solveSample(page);
  const end = page.getByRole('region', { name: 'Solved. Every entry cracked.' });
  await expect(end).toBeVisible();
  await expect(end.getByText('Played')).toBeVisible();
  const share = end.getByLabel('Result to share');
  await expect(share).toContainText('Solved in 9 guesses');
  await expect(share).not.toContainText('LEVEL');

  // With nothing left to move on to, the last clue stays selected and typing does nothing.
  await expect(panel(page).getByRole('heading', { name: 'Not even' })).toBeVisible();
  await page.keyboard.type('ABC');
  await page.keyboard.press('Enter');
  // A key the game took would clear the last guess's result.
  await expect(panel(page).getByText(/^ODD solves \d+ Down\.$/)).toBeVisible();
  await expect(end).toBeVisible();
});

test('names a solved game on the leaderboard, refusing rude nicknames', async ({ page }) => {
  await solveSample(page);
  const form = page.getByRole('form', { name: 'Your nickname for the leaderboard' });
  const field = form.getByLabel('Your nickname for the leaderboard');
  const submit = form.getByRole('button', { name: 'Submit' });

  // Typing in the field doesn't reach the grid.
  await field.fill('B u m');
  // On a site with a bot check, Submit waits for Cloudflare's widget (test keys pass at once).
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();
  await expect(form.getByRole('status')).toHaveText('Please choose a different nickname.');

  await field.fill('  Grid   Tester ');
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();
  await expect(form.getByRole('status')).toHaveText(
    "Saved as Grid Tester. You're on the leaderboard with 9 guesses, 0 Crossword clues and 0 Wordle clues.",
  );
  await expect(field).toHaveValue('Grid Tester');
  await expect(form.getByRole('button', { name: 'Update' })).toBeVisible();
});

test('can switch to high-contrast colours', async ({ page }) => {
  const toggle = page.getByRole('button', { name: 'High contrast' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-high-contrast', '');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('works with the on-screen keyboard', async ({ page }) => {
  const keyboard = page.getByLabel('Keyboard');
  for (const letter of 'LEVEL')
    await keyboard.getByRole('button', { name: letter, exact: true }).click();
  await keyboard.getByRole('button', { name: 'Enter' }).click();
  await expect(clue(page, 'Flat and even')).toContainText('Solved in 1');
});
