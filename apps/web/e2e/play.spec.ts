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

test('rejects words that are not in the word list without using a guess', async ({ page }) => {
  await guess(page, 'LEVXL');
  await expect(panel(page).getByText('Not in the word list.')).toBeVisible();
  await expect(panel(page).getByText('24 of 24 guesses left')).toBeVisible();

  // The letters stay so the player can fix them.
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await guess(page, 'EL');
  await expect(clue(page, 'Flat and even')).toContainText('Solved in 1');
});

test('accepts newer words from the British list', async ({ page }) => {
  // EMAIL and PODCAST are in the SCOWL British list but not in ENABLE.
  await guess(page, 'EMAIL');
  await expect(panel(page).getByText('23 of 24 guesses left')).toBeVisible();
  await clue(page, 'Resolved, as a dispute').click();
  await guess(page, 'PODCAST');
  await expect(panel(page).getByText('22 of 24 guesses left')).toBeVisible();
});

test('lets a guess fish with other letters, and keeps greens off the grid', async ({ page }) => {
  await guess(page, 'EERIE'); // the second E is green
  const grid = page.getByRole('group', { name: /Crossword grid/ });
  await expect(grid.getByRole('button', { name: 'row 1, column 2, empty' })).toBeVisible();

  // The next guess starts empty, like Wordle, and can drop the green E.
  const next = panel(page).getByRole('listitem', { name: 'Current guess' });
  await expect(next).toHaveText('');
  await guess(page, 'TABLE');
  await expect(panel(page).getByText('22 of 24 guesses left')).toBeVisible();
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

  // The game moves on to 1 Down, whose first letter is now locked to L.
  await expect(panel(page).getByRole('heading', { name: 'Milky coffee order' })).toBeVisible();
  await guess(page, 'LATTE');
  await expect(clue(page, 'Milky coffee order')).toContainText('Solved in 1');
});

test('never changes a solved answer on the grid', async ({ page }) => {
  await guess(page, 'LEVEL');
  // 1 Down crosses LEVEL's first L; MATTE puts an M there instead.
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
  await expect(panel(page).getByText('24 of 24 guesses left')).toBeVisible();
});

test('tells the player what a guess found', async ({ page }) => {
  await guess(page, 'EERIE');
  await expect(panel(page).getByText('EERIE: 1 green, 1 yellow.')).toBeVisible();
});

test('shows stats and a spoiler-free result when the puzzle ends', async ({ page }) => {
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
