<script lang="ts">
  import { fetchLeaderboard, type Board, type YourPlace } from '../lib/api';
  import { collectionOf } from '../lib/collections';
  import { localDate } from '../lib/dates';
  import { puzzleDays } from '../lib/puzzles';

  /**
   * A puzzle's leaderboard: the top 100 named, unbroken first-attempt wins, then where this player
   * stands. Daily and Naughty puzzles have separate boards. `version` changes when the board may
   * have (the player named themselves), to fetch it again. A date picker shows another day's
   * board from the same collection, up to today.
   */
  let { puzzleId, version = 0 }: { puzzleId: string; version?: number } = $props();

  const collection = $derived(collectionOf(puzzleId));
  /** The puzzle whose board is shown: the one being played, unless another day is picked. */
  let shownId = $derived(puzzleId);
  /** A picked date with no puzzle on it. */
  let noPuzzleOn = $derived.by((): string | undefined => {
    void puzzleId; // Cleared when the page moves to another puzzle.
    return undefined;
  });
  /** The days with a puzzle, by date; empty until loaded, or if they can't be. */
  let days = $state.raw<ReadonlyMap<string, string>>(new Map());

  let loaded = $state<{ id: string; board: Board } | undefined>();
  const board = $derived(loaded?.id === shownId ? loaded.board : undefined);
  let failed = $state(false);
  // Fetches can overlap (naming yourself refetches, picking a day): only the newest one's answer
  // is shown.
  let latest = 0;

  $effect(() => {
    void version;
    const id = shownId;
    const request = ++latest;
    void fetchLeaderboard(id).then((result) => {
      if (request !== latest) return;
      // A failed refresh keeps the board already shown.
      if (result !== undefined) loaded = { id, board: result };
      failed = result === undefined;
    });
  });

  $effect(() => {
    const current = collection;
    puzzleDays(current).then(
      (found) => {
        if (current === collection) days = found;
      },
      () => (days = new Map()),
    );
  });

  const dates = $derived([...days.keys()]);
  const shownDate = $derived(noPuzzleOn ?? collection.dateOf(shownId) ?? '');

  function pick(event: Event & { currentTarget: HTMLInputElement }) {
    const date = event.currentTarget.value;
    if (date === '') return; // Cleared: keep the board shown.
    const id = days.get(date);
    noPuzzleOn = id === undefined ? date : undefined;
    if (id !== undefined) shownId = id;
  }

  function backToPuzzle() {
    noPuzzleOn = undefined;
    shownId = puzzleId;
  }

  const longDay = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  function dayName(date: string): string {
    return longDay.format(new Date(`${date}T00:00:00`));
  }

  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

  /** The finish time; with the date too when it wasn't the puzzle's own day. */
  function finished(at: string): string {
    const when = new Date(at);
    const date = collection.dateOf(shownId);
    return date === undefined || date === localDate(when)
      ? time.format(when)
      : `${day.format(when)}, ${time.format(when)}`;
  }

  function ordinal(n: number): string {
    const tens = n % 100;
    const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
    return `${n}${suffix}`;
  }

  function placeText(you: YourPlace, shown: number): string | undefined {
    switch (you.status) {
      case 'on-board':
        return you.rank > shown ? `You're ${ordinal(you.rank)}.` : undefined;
      case 'no-nickname':
        return `Add a nickname to join the board: you'd be ${ordinal(you.rank)}.`;
      case 'not-ranked':
        return you.reason === 'restarted'
          ? "You restarted this puzzle, so it isn't on the board. It's kept in your own record."
          : "Only wins go on the board. This one's kept in your own record.";
      case 'hidden':
        return "Your result isn't shown on the board.";
    }
  }
</script>

<section class="board" aria-labelledby="board-title">
  <div class="head">
    <h2 id="board-title">Leaderboard</h2>
    {#if dates.length > 0}
      <div class="day">
        <label for="board-day">Day</label>
        <input
          id="board-day"
          type="date"
          min={dates[0]}
          max={dates.at(-1)}
          value={shownDate}
          onchange={pick}
        />
        {#if shownId !== puzzleId || noPuzzleOn !== undefined}
          <button type="button" class="link" onclick={backToPuzzle}>Back to this puzzle</button>
        {/if}
      </div>
    {/if}
  </div>
  {#if noPuzzleOn !== undefined}
    <p class="note" role="status">
      {noPuzzleOn > (dates.at(-1) ?? '')
        ? `The puzzle for ${dayName(noPuzzleOn)} isn't out yet.`
        : `There was no puzzle on ${dayName(noPuzzleOn)}.`}
    </p>
  {:else if board === undefined}
    <p class="note" role="status">
      {failed ? "The leaderboard didn't load. Check your connection." : 'Loading the leaderboard…'}
    </p>
  {:else}
    {#if board.entries.length === 0}
      <p class="note">No one's on the board yet. Solve it first time, then add a nickname.</p>
    {:else}
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Nickname</th>
              <th scope="col">Guesses</th>
              <th scope="col">Crossword clues</th>
              <th scope="col">Wordle clues</th>
              <th scope="col">Finished</th>
            </tr>
          </thead>
          <tbody>
            {#each board.entries as entry (entry.rank)}
              <tr class:you={entry.isYou} aria-current={entry.isYou ? 'true' : undefined}>
                <td>{entry.rank}</td>
                <th scope="row">
                  {entry.nickname}
                  {#if entry.isYou}<span class="tag">(you)</span>{/if}
                </th>
                <td>{entry.guesses}</td>
                <td>{entry.crosswordHints}</td>
                <td>{entry.wordleHints}</td>
                <td>{finished(entry.finishedAt)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if board.total > board.entries.length}
        <p class="note">Top {board.entries.length} of {board.total}.</p>
      {/if}
    {/if}
    {#if board.you !== undefined}
      {@const text = placeText(board.you, board.entries.length)}
      {#if text !== undefined}
        <p class="place">{text}</p>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .board {
    display: grid;
    gap: 8px;
    margin: 0 0 20px;
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 8px;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
  }

  .day {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .day label {
    color: var(--ink-muted);
  }

  .day input {
    font: inherit;
    padding: 4px 6px;
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 6px;
  }

  .link {
    padding: 0;
    font: inherit;
    border: 0;
    background: none;
    color: var(--ink-muted);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.1rem;
  }

  p {
    margin: 0;
  }

  .note {
    color: var(--ink-muted);
  }

  .place {
    font-weight: 700;
  }

  /* The table scrolls on its own on a narrow phone, never the page. */
  .scroll {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--rule);
    text-align: right;
    white-space: nowrap;
  }

  thead th {
    color: var(--ink-muted);
    font-size: 0.8rem;
    font-weight: 700;
    white-space: normal;
    vertical-align: bottom;
  }

  th[scope='row'],
  thead th:nth-child(2) {
    text-align: left;
  }

  th[scope='row'] {
    font-weight: 400;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  tr.you {
    background: var(--select);
  }

  tr.you th[scope='row'] {
    font-weight: 700;
  }

  .tag {
    color: var(--ink-muted);
    font-weight: 400;
  }
</style>
