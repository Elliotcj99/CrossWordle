import { expect, test, type Page } from '@playwright/test';

async function guess(page: Page, word: string) {
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
}

const panel = (page: Page) => page.getByRole('region', { name: 'Current entry' });
/** The Your record panel, which opens below the header from its toggle. */
const recordPanel = (page: Page) => page.getByRole('region', { name: 'Your record', exact: true });
const clue = (page: Page, text: string) =>
  page.getByRole('region', { name: 'Clues' }).getByRole('button', { name: new RegExp(text) });

test.beforeEach(async ({ page, baseURL }) => {
  // Each test is its own visitor to the API. The tests reach the server directly, never through
  // Cloudflare (npm run preview, or a deployed site's binding: see playwright.config.ts), so every
  // request would share one address, and the forms' per-address rate limits would trip across
  // runs. Addresses are from 192.0.2.0/24, the documentation range.
  const visitor = `192.0.2.${1 + Math.floor(Math.random() * 254)}`;
  // Only the site's own API: Cloudflare's bot check makes requests of its own.
  const site = new URL(baseURL!).origin;
  const ownApi = (url: URL) => url.origin === site && url.pathname.startsWith('/api/');
  await page.route(ownApi, (route) =>
    route.continue({ headers: { ...route.request().headers(), 'cf-connecting-ip': visitor } }),
  );
  // The sample puzzle, so the tests don't depend on today's date.
  await page.goto('/#sample');
  await expect(panel(page).getByRole('heading', { name: 'Flat and even' })).toBeVisible();
});

test("goes from a past puzzle back to today's", async ({ page }) => {
  // The tests start on the sample puzzle (#sample), which isn't today's.
  const notice = page.getByText("This isn't today's puzzle.");
  await expect(notice).toBeVisible();
  await page.getByRole('button', { name: "Go to today's puzzle" }).click();
  await expect(panel(page).getByRole('heading', { name: 'Flat and even' })).toHaveCount(0);
  await expect(notice).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('');
  // Back returns to the past puzzle.
  await page.goBack();
  await expect(panel(page).getByRole('heading', { name: 'Flat and even' })).toBeVisible();
  await expect(notice).toBeVisible();
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

test('fills the Wordle-clue row with letters solved crossings give, even after the clue', async ({
  page,
}) => {
  // 1A LEVEL: LATTE crosses its first letter and VALET its third.
  await panel(page).getByRole('button', { name: 'Wordle clue' }).click();
  await panel(page).getByRole('button', { name: 'Reveal' }).click();
  const row = panel(page).getByLabel('Revealed letters');
  await expect(row.getByLabel(/, clue$/)).toHaveCount(1);

  await clue(page, 'Milky coffee order').click();
  await guess(page, 'LATTE');
  await expect(clue(page, 'Milky coffee order')).toContainText('Solved in 1');
  await clue(page, 'Attendant who parks your car').click();
  await guess(page, 'VALET');
  await expect(clue(page, 'Attendant who parks your car')).toContainText('Solved in 1');

  // Back on 1A, both crossing letters are in the row (one may be the clue letter itself).
  await clue(page, 'Flat and even').click();
  await expect(row.getByLabel(/^Position 1, L/)).toBeVisible();
  await expect(row.getByLabel(/^Position 3, V/)).toBeVisible();
  // It's only what the player sees: 1A still has its full guess budget.
  await expect(panel(page).getByText('16 of 18 guesses left')).toBeVisible();
});

test('never spends a Wordle clue on a letter the grid already shows', async ({ page }) => {
  // Solve LATTE and VALET first: LEVEL (1A) then shows L at position 1 and V at position 3.
  await clue(page, 'Milky coffee order').click();
  await guess(page, 'LATTE');
  await expect(clue(page, 'Milky coffee order')).toContainText('Solved in 1');
  await clue(page, 'Attendant who parks your car').click();
  await guess(page, 'VALET');
  await expect(clue(page, 'Attendant who parks your car')).toContainText('Solved in 1');

  await clue(page, 'Flat and even').click();
  await panel(page).getByRole('button', { name: 'Wordle clue' }).click();
  await panel(page).getByRole('button', { name: 'Reveal' }).click();
  // Of L E V E L, the grid shows the first L and the V; the last L is then a letter already seen,
  // so the clue is an E, the leftmost: position 2.
  const row = panel(page).getByLabel('Revealed letters');
  await expect(row.getByLabel(/, clue$/)).toHaveAccessibleName('Position 2, E, clue');
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
  // From the keyboard: Enter on the focused Submit button is for the form, not the grid.
  await submit.focus();
  await page.keyboard.press('Enter');
  await expect(form.getByRole('status')).toHaveText(
    "Saved as Grid Tester. You're on the leaderboard with 9 guesses, 0 Crossword clues and 0 Wordle clues.",
  );
  await expect(field).toHaveValue('Grid Tester');
  await expect(form.getByRole('button', { name: 'Update' })).toBeVisible();

  // The board shows the player once they've named themselves: as their own row, or, on a
  // long-lived test site with more than 100 ahead of them, their place below it.
  const board = page.getByRole('region', { name: 'Leaderboard' });
  await expect(
    board
      .getByRole('row', { name: /Grid Tester \(you\) 9 0 0/ })
      .or(board.getByText(/^You're \d+(st|nd|rd|th)\.$/)),
  ).toBeVisible();
});

test('shows the leaderboard while playing, and before anyone is on it says so', async ({
  page,
}) => {
  const board = page.getByRole('region', { name: 'Leaderboard' });
  await expect(board).toHaveCount(0);
  await page.getByRole('button', { name: 'Leaderboard' }).click();
  await expect(board.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
  await expect(
    board.getByRole('table').or(board.getByText(/No one's on the board yet/)),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Hide leaderboard' }).click();
  await expect(board).toHaveCount(0);
});

test("picks another day's leaderboard, and goes back to this puzzle's", async ({ page }) => {
  await page.getByRole('button', { name: 'Leaderboard' }).click();
  const board = page.getByRole('region', { name: 'Leaderboard' });
  const day = board.getByLabel('Day');
  // The sample puzzle has no date of its own.
  await expect(day).toHaveValue('');
  const latest = (await day.getAttribute('max'))!;
  const first = (await day.getAttribute('min'))!;
  expect(latest).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(first <= latest).toBe(true);

  // The latest day's board, asked for by its puzzle's id (a daily puzzle's id is its date).
  const [asked] = await Promise.all([
    page.waitForRequest((r) => new URL(r.url()).pathname === '/api/leaderboard'),
    day.fill(latest),
  ]);
  expect(new URL(asked.url()).searchParams.get('puzzle')).toBe(latest);
  await expect(
    board.getByRole('table').or(board.getByText(/No one's on the board yet/)),
  ).toBeVisible();

  // A day with no puzzle says so.
  await day.fill('2000-01-01');
  await expect(board.getByText('There was no puzzle on')).toBeVisible();

  await board.getByRole('button', { name: 'Back to this puzzle' }).click();
  await expect(day).toHaveValue('');
  await expect(board.getByRole('button', { name: 'Back to this puzzle' })).toHaveCount(0);
  await expect(
    board.getByRole('table').or(board.getByText(/No one's on the board yet/)),
  ).toBeVisible();
});

test("carries on from the server's copy of a game this browser has lost", async ({ page }) => {
  await guess(page, 'LEVEL');
  await expect(clue(page, 'Flat and even')).toContainText('Solved in 1');
  // Like another device with the same player id (a restored record): no saved game here.
  await page.evaluate(() => localStorage.removeItem('crosswordle:game:sample'));
  await page.reload();
  await expect(clue(page, 'Flat and even')).toContainText('Solved in 1');
  await expect(page.getByText('1 of 9 solved')).toBeVisible();
});

test('brings a record back with a recovery code after the browser forgets it', async ({ page }) => {
  // Only where the server keeps records (the Node server), like the nickname form.
  const record = recordPanel(page);
  const playerId = () => page.evaluate(() => localStorage.getItem('crosswordle:player'));
  await page.getByRole('button', { name: 'Your record', exact: true }).click();
  await record.getByRole('button', { name: 'Make a recovery code' }).click();
  const shown = record.getByLabel('Your recovery code');
  await expect(shown).toHaveText(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
  const code = (await shown.textContent())!;
  // The id is made on the first request to the server, so it exists by now.
  const original = await playerId();
  expect(original).not.toBeNull();

  // The browser's data is cleared: a new player id.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Your record', exact: true }).click();
  // Opening the panel asks the server about this browser's (new) id.
  await expect.poll(playerId).not.toBeNull();
  expect(await playerId()).not.toBe(original);

  // Typed as people do: lower case, with spaces.
  await record
    .getByLabel('Recovery code', { exact: true })
    .fill(code.toLowerCase().replace(/-/g, ' '));
  const restore = record.getByRole('button', { name: 'Restore' });
  await expect(restore).toBeEnabled({ timeout: 15_000 });
  await Promise.all([page.waitForEvent('load'), restore.click()]);
  expect(await playerId()).toBe(original);
});

for (const browserSaves of [true, false]) {
  test(`asks the browser to save a new recovery code (${browserSaves ? 'it can' : 'it refuses'})`, async ({
    page,
  }) => {
    // Headless Chrome has no password manager behind navigator.credentials.store (it rejects
    // with NotSupportedError), and no test can see Chrome's "Save password?" prompt. So the test
    // stands in for the password manager: it notes what the page hands over, then accepts or
    // refuses it.
    await page.evaluate((saves) => {
      navigator.credentials.store = (credential: Credential) => {
        (window as { handedOver?: unknown }).handedOver = {
          type: credential.type,
          id: credential.id,
          password: (credential as Credential & { password?: string }).password,
        };
        return saves
          ? Promise.resolve()
          : Promise.reject(new DOMException('No password manager', 'NotSupportedError'));
      };
    }, browserSaves);
    const record = recordPanel(page);
    await page.getByRole('button', { name: 'Your record', exact: true }).click();
    await record.getByRole('button', { name: 'Make a recovery code' }).click();
    const shown = record.getByLabel('Your recovery code');
    await expect(shown).toHaveText(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    const code = (await shown.textContent())!;
    await record.getByRole('button', { name: 'Save in my password manager' }).click();

    await expect(
      record.getByText(
        browserSaves
          ? 'Your browser has been asked to save it'
          : "If your browser offered to save it, choose Save. If it didn't, use Copy",
      ),
    ).toBeVisible();
    expect(await page.evaluate(() => (window as { handedOver?: unknown }).handedOver)).toEqual({
      type: 'password',
      id: 'CrossWordle recovery code',
      password: code,
    });
  });
}

test('saves a new recovery code by submitting the form where the browser has no PasswordCredential', async ({
  page,
}) => {
  // As in Safari and Firefox: the form really posts, the page comes back, and shows the code again.
  await page.evaluate(() => {
    delete (window as { PasswordCredential?: unknown }).PasswordCredential;
  });
  const hash = new URL(page.url()).hash;
  const record = recordPanel(page);
  await page.getByRole('button', { name: 'Your record', exact: true }).click();
  await record.getByRole('button', { name: 'Make a recovery code' }).click();
  const shown = record.getByLabel('Your recovery code');
  await expect(shown).toHaveText(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
  const code = (await shown.textContent())!;
  // Edited fields are put back: the browser is always offered the code itself.
  await record.getByLabel('Code', { exact: true }).fill('something else');

  const [posted] = await Promise.all([
    page.waitForRequest((request) => new URL(request.url()).pathname === '/api/save-code'),
    page.waitForEvent('load'),
    record.getByRole('button', { name: 'Save in my password manager' }).click(),
  ]);
  expect(new URLSearchParams(posted.postData() ?? '').get('password')).toBe(code);

  await expect(record).toBeVisible();
  await expect(shown).toHaveText(code);
  await expect(
    record.getByText("If your browser offered to save it, choose Save. If it didn't, use Copy"),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe(hash);
  expect(
    await page.evaluate(() => sessionStorage.getItem('crosswordle:new-recovery-code')),
  ).toBeNull();
});

test.describe('the offer to restore a record, for a browser given a new player id', () => {
  const banner = (page: Page) =>
    page.getByRole('complementary', { name: 'Bring back your record' });

  test('opens the recovery-code form, and once closed stays closed', async ({ page }) => {
    // Every test starts in a fresh browser: a new player id, so the offer shows.
    await expect(banner(page)).toContainText('Played here before?');
    await banner(page).getByRole('button', { name: 'restore your record' }).click();
    await expect(page.getByLabel('Recovery code', { exact: true })).toBeFocused();

    await banner(page).getByRole('button', { name: 'Close' }).click();
    await expect(banner(page)).toHaveCount(0);
    await page.reload();
    await expect(panel(page).getByRole('heading', { name: 'Flat and even' })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test('goes for good once the player makes a guess', async ({ page }) => {
    await expect(banner(page)).toBeVisible();
    await guess(page, 'EMAIL');
    await expect(banner(page)).toHaveCount(0);
    await page.reload();
    await expect(panel(page).getByRole('heading', { name: 'Flat and even' })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test("isn't offered to a browser that already had its id", async ({ page }) => {
    // As for everyone who played before the offer existed: an id, and no note of an offer.
    await page.evaluate(() => localStorage.removeItem('crosswordle:restore-prompt'));
    await page.reload();
    await expect(panel(page).getByRole('heading', { name: 'Flat and even' })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test('comes back if the browser loses its id again', async ({ page }) => {
    await banner(page).getByRole('button', { name: 'Close' }).click();
    // As Safari does after a week away: the site's storage is cleared.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(banner(page)).toBeVisible();
  });
});

test('shows the contact address only when asked, and what the site stores', async ({ page }) => {
  // The footer is inside <main>, so it isn't a contentinfo landmark.
  const footer = page.locator('footer');
  const contact = footer.getByRole('button', { name: 'Contact us' });
  // A site without a contact address in its config has no Contact link.
  if ((await contact.count()) > 0) {
    await expect(footer.getByRole('link', { name: /@/ })).toHaveCount(0);
    await contact.click();
    await expect(footer.getByRole('link', { name: /^[^@\s]+@[^@\s]+$/ })).toHaveAttribute(
      'href',
      /^mailto:/,
    );
  }
  await footer.getByRole('button', { name: 'What we store' }).click();
  await expect(footer.getByRole('heading', { name: 'What we store' })).toBeVisible();
  await expect(footer.getByText(/deleted after 30 days/)).toBeVisible();
});

test('sends a feature request, saying what to fix first', async ({ page }) => {
  const footer = page.locator('footer');
  await footer.getByRole('button', { name: 'Request a feature' }).click();
  const form = footer.getByRole('form', { name: 'Request a feature' });
  await form.getByLabel('What would you like?').fill('Dark mode');
  // Typing in the form doesn't reach the grid.
  await form.getByLabel(/Tell us more/).fill('Too short');
  await expect(page.getByText('0 of 9 solved')).toBeVisible();
  const send = form.getByRole('button', { name: 'Send' });
  await expect(send).toBeEnabled({ timeout: 15_000 });

  // A description under 10 characters is caught before anything is sent.
  const sent = page.waitForRequest('**/api/feedback', { timeout: 2_000 }).catch(() => undefined);
  await send.click();
  await expect(form.getByRole('status')).toHaveText(/Tell us a bit more: 10 to 2,000 characters/);
  expect(await sent).toBeUndefined();

  await form.getByLabel(/Tell us more/).fill('A dark colour scheme for night-time solving.');
  await send.click();
  await expect(footer.getByText("Thanks, it's sent.")).toBeVisible();

  // Another one gets a fresh bot check, so it can be sent too.
  await footer.getByRole('button', { name: 'Send another' }).click();
  await form.getByLabel('What would you like?').fill('Bigger tiles');
  await form.getByLabel(/Tell us more/).fill('Larger letters on the grid for phones, please.');
  await expect(send).toBeEnabled({ timeout: 15_000 });
  await send.click();
  await expect(footer.getByText("Thanks, it's sent.")).toBeVisible();
});

test('deletes a record from the server and this browser', async ({ page }) => {
  await guess(page, 'LEVEL');
  await expect(clue(page, 'Flat and even')).toContainText('Solved in 1');
  const before = await page.evaluate(() => localStorage.getItem('crosswordle:player'));

  const record = recordPanel(page);
  await page.getByRole('button', { name: 'Your record', exact: true }).click();
  await record.getByRole('button', { name: 'Delete my record' }).click();
  await Promise.all([
    page.waitForEvent('load'),
    record.getByRole('button', { name: 'Yes, delete everything' }).click(),
  ]);

  // Nothing left here, and nothing on the server for the old id either.
  await expect(page.getByText('0 of 9 solved')).toBeVisible();
  const status = await page.evaluate(async (id) => {
    const response = await fetch('api/game?puzzle=sample', { headers: { 'x-player-id': id! } });
    return response.status;
  }, before);
  // The deleted id can't be used again.
  expect(status).toBe(410);
});

test('answers the uptime monitor in one word', async ({ request }) => {
  // Every date a player can be on now (UTC−12 to UTC+14): "ok" is expected whenever the
  // published puzzles cover them all, so only running out of puzzles may make it "down".
  const dateAt = (offsetHours: number) =>
    new Date(Date.now() + offsetHours * 3_600_000).toISOString().slice(0, 10);
  const dates = [...new Set([dateAt(-12), dateAt(0), dateAt(14)])];
  const ids = async (path: string) =>
    ((await (await request.get(path)).json()) as { id: string }[]).map((p) => p.id);
  const published = new Set([
    ...(await ids('puzzles/index.json')),
    ...(await ids('naughty/index.json')),
  ]);
  const covered = dates.every((d) => published.has(d) && published.has(`naughty-${d}`));

  const response = await request.get('api/health');
  expect(response.headers()['cache-control']).toBe('no-store');
  const body = (await response.json()) as Record<string, unknown>;
  // One word (and maybe the puzzles reminder), never any detail.
  expect(Object.keys(body).filter((key) => key !== 'status' && key !== 'warning')).toEqual([]);
  if (covered) {
    expect(response.status()).toBe(200);
    expect(body.status).toBe('ok');
  } else {
    expect(response.status()).toBe(503);
    expect(body.status).toBe('down');
  }
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

test.describe('the Stats panel', () => {
  const stats = (page: Page) => page.getByRole('region', { name: 'Stats', exact: true });

  test('says when there are no stats yet', async ({ page }) => {
    await page.getByRole('button', { name: 'Stats', exact: true }).click();
    await expect(stats(page)).toContainText("You haven't got any recorded stats yet.");
  });

  test('counts daily and Naughty puzzles apart, and opens a past one', async ({ page }) => {
    await page.evaluate(() =>
      localStorage.setItem(
        'crosswordle:results',
        JSON.stringify({
          '2026-10-23': { won: true, guesses: 14 },
          '2026-10-24': { won: false, guesses: 18 },
          'naughty-2026-10-30': { won: true, guesses: 9 },
        }),
      ),
    );
    await page.reload();
    await expect(panel(page).getByRole('heading', { name: 'Flat and even' })).toBeVisible();
    await page.getByRole('button', { name: 'Stats', exact: true }).click();

    const daily = stats(page).getByRole('region', { name: 'Daily' });
    await expect(daily.locator('dl')).toHaveText(/Played\s*2\s*Won\s*50%/);
    await expect(daily.getByText('Won in 14 guesses')).toBeVisible();
    await expect(daily.getByText('Out of guesses')).toBeVisible();
    const naughty = stats(page).getByRole('region', { name: 'Naughty' });
    await expect(naughty.locator('dl')).toHaveText(/Played\s*1\s*Won\s*100%/);

    // Newest first: the 24th. Following it opens that puzzle and closes the panel.
    await daily.getByRole('link').first().click();
    await expect(page).toHaveURL(/#2026-10-24$/);
    await expect(stats(page)).toHaveCount(0);

    // A Naughty puzzle asks before turning Naughty mode on.
    await page.getByRole('button', { name: 'Stats', exact: true }).click();
    await naughty.getByRole('link').first().click();
    await expect(page.getByRole('alertdialog')).toContainText('Naughty mode contains strong');
  });
});

test('opens How to play across the width of the page', async ({ page }) => {
  await page.getByRole('button', { name: 'How to play' }).click();
  const help = page.getByRole('region', { name: 'How to play' });
  await expect(help).toContainText('Every Across and Down entry is its own Wordle.');
  const header = (await page.locator('header.masthead').boundingBox())!;
  const box = (await help.boundingBox())!;
  expect(Math.abs(box.width - header.width)).toBeLessThan(2);
});

test('hides the result, and keeps it hidden on coming back', async ({ page }) => {
  await solveSample(page);
  const end = page.getByRole('region', { name: 'Solved. Every entry cracked.' });
  await expect(end).toBeVisible();
  await page.getByRole('button', { name: 'Hide result' }).click();
  await expect(end).toBeHidden();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Show result' })).toBeVisible();
  await expect(end).toBeHidden();
  await page.getByRole('button', { name: 'Show result' }).click();
  await expect(end).toBeVisible();
});

test('opens Your record across the width of the page', async ({ page }) => {
  await page.getByRole('button', { name: 'Your record', exact: true }).click();
  const record = recordPanel(page);
  await expect(record.getByRole('heading', { name: 'Keep your record' })).toBeVisible();
  const header = (await page.locator('header.masthead').boundingBox())!;
  const box = (await record.boundingBox())!;
  expect(Math.abs(box.width - header.width)).toBeLessThan(2);
});

test('steps through only the unsolved clues with Next and Prev', async ({ page }) => {
  const heading = (name: string) => panel(page).getByRole('heading', { name });
  await guess(page, 'LEVEL');
  // Solving moves on to the next unsolved clue.
  await expect(heading('Bottomless pit')).toBeVisible();
  // Back past the solved 1 Across, wrapping round to the last Down.
  await page.getByRole('button', { name: 'Previous clue' }).click();
  await expect(heading('Not even')).toBeVisible();
  await page.getByRole('button', { name: 'Next clue' }).click();
  await expect(heading('Bottomless pit')).toBeVisible();
});

test('puts the clue list beside the game where the screen is wide enough', async ({ page }) => {
  const box = async (name: string) =>
    (await page.getByRole('region', { name, exact: true }).boundingBox())!;

  // A desktop at its usual zoom: three columns.
  await page.setViewportSize({ width: 1440, height: 900 });
  let entry = await box('Current entry');
  let clues = await box('Clues');
  expect(clues.x).toBeGreaterThan(entry.x + entry.width - 1);
  expect(Math.abs(clues.y - entry.y)).toBeLessThan(2);

  // Narrower, or zoomed in: the list goes back below the game.
  await page.setViewportSize({ width: 1100, height: 900 });
  entry = await box('Current entry');
  clues = await box('Clues');
  expect(clues.y).toBeGreaterThan(entry.y + entry.height - 1);
});
