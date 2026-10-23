import { expect, test, type Page } from '@playwright/test';

async function guess(page: Page, word: string) {
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
}

const panel = (page: Page) => page.getByRole('region', { name: 'Current entry' });
const clue = (page: Page, text: string) =>
  page.getByRole('region', { name: 'Clues' }).getByRole('button', { name: new RegExp(text) });

test.beforeEach(async ({ page }) => {
  // The sample puzzle, so the tests don't depend on today's date.
  await page.goto('/#sample');
  await expect(panel(page).getByRole('heading', { name: 'Flat and even' })).toBeVisible();
});

test('shows every clue', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Clues' }).getByRole('button')).toHaveCount(9);
});

test('accepts any combination of letters as a guess', async ({ page }) => {
  await guess(page, 'XQZVK');
  await expect(panel(page).getByText('26 of 27 guesses left')).toBeVisible();
  await expect(panel(page).getByText('XQZVK: 0 green, 1 yellow.')).toBeVisible();
});

test("locks an entry's own greens into its next guess", async ({ page }) => {
  await guess(page, 'EERIE'); // the second E is green
  const next = panel(page).getByRole('listitem', { name: 'Current guess' });
  await expect(next.getByLabel('E, locked')).toHaveCount(1);

  // Only the gaps need typing, and the lock can't be overwritten.
  await guess(page, 'LVEL');
  await expect(clue(page, 'Flat and even')).toContainText('Solved in 2');
});

test('badges green and yellow tiles whose letter the answer repeats', async ({ page }) => {
  await guess(page, 'EERIE');
  const row = panel(page).getByRole('listitem').first();
  await expect(row.getByLabel('E, in the word, the answer has 2 Es')).toHaveCount(1);
  await expect(row.getByLabel('E, correct, the answer has 2 Es')).toHaveCount(1);
  await expect(row.getByLabel('E, not in the word')).toHaveCount(1);
});

test('locks greens into the crossing entry, and accepts the whole word typed over a lock', async ({
  page,
}) => {
  await guess(page, 'LEVEL');
  await expect(clue(page, 'Flat and even')).toContainText('Solved in 1');

  // The game moves on to 1 Down, whose first letter is now locked to L.
  await expect(panel(page).getByRole('heading', { name: 'Milky coffee order' })).toBeVisible();
  await guess(page, 'LATTE');
  await expect(clue(page, 'Milky coffee order')).toContainText('Solved in 1');
});

test('accepts only the open letters too', async ({ page }) => {
  await guess(page, 'LEVEL');
  await guess(page, 'ATTE');
  await expect(clue(page, 'Milky coffee order')).toContainText('Solved in 1');
});

test('keeps progress after a reload, and restart clears it', async ({ page }) => {
  await guess(page, 'LEVEL');
  await page.reload();
  await expect(clue(page, 'Flat and even')).toContainText('Solved in 1');

  await page.getByRole('button', { name: 'Restart' }).click();
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect(clue(page, 'Flat and even')).not.toContainText('Solved');
  await expect(page.getByText('0 of 9 solved')).toBeVisible();
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
  await expect(panel(page).getByText('27 of 27 guesses left')).toBeVisible();
});

test('fills the gaps even when a gap letter matches the lock before it', async ({ page }) => {
  await guess(page, 'LEVEL');
  await clue(page, 'Andean pack animal').click();
  await guess(page, 'LAMA'); // L locked, so LAMA fills L????
  await expect(clue(page, 'Andean pack animal')).toContainText('Solved in 1');
});

test('tells the player what a guess found', async ({ page }) => {
  await guess(page, 'EERIE');
  await expect(panel(page).getByText('EERIE: 1 green, 1 yellow.')).toBeVisible();
});

test('shows stats and a spoiler-free result when the puzzle ends', async ({ page }) => {
  // Whole words, typed over whichever letters crossings have already locked.
  for (const word of [
    'LEVEL',
    'LATTE',
    'VALET',
    'LLAMA',
    'ABYSS',
    'SETTLED',
    'EXTRA',
    'HELLO',
    'ODD',
  ]) {
    await guess(page, word);
  }
  const end = page.getByRole('region', { name: 'Solved. Every entry cracked.' });
  await expect(end).toBeVisible();
  await expect(end.getByText('Played')).toBeVisible();
  const share = end.getByLabel('Result to share');
  await expect(share).toContainText('Solved in 9 guesses');
  await expect(share).not.toContainText('LEVEL');
});

test('can switch to high-contrast colours', async ({ page }) => {
  await page.getByLabel('High-contrast colours').check();
  await expect(page.locator('html')).toHaveAttribute('data-high-contrast', '');
  await page.reload();
  await expect(page.getByLabel('High-contrast colours')).toBeChecked();
});

test('works with the on-screen keyboard', async ({ page }) => {
  const keyboard = page.getByLabel('Keyboard');
  for (const letter of 'LEVEL')
    await keyboard.getByRole('button', { name: letter, exact: true }).click();
  await keyboard.getByRole('button', { name: 'Enter' }).click();
  await expect(clue(page, 'Flat and even')).toContainText('Solved in 1');
});
