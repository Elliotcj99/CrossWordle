<script lang="ts">
  import { fetchLeaderboard, type Board, type YourPlace } from '../lib/api';

  /**
   * A puzzle's leaderboard: the top 100 named, unbroken first-attempt wins, then where this player
   * stands. Daily and Naughty puzzles have separate boards. `version` changes when the board may
   * have (the player named themselves), to fetch it again.
   */
  let { puzzleId, version = 0 }: { puzzleId: string; version?: number } = $props();

  let board = $state<Board | undefined>();
  let failed = $state(false);

  $effect(() => {
    void version;
    const id = puzzleId;
    failed = false;
    void fetchLeaderboard(id).then((result) => {
      if (id !== puzzleId) return;
      board = result;
      failed = result === undefined;
    });
  });

  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

  /** The finish time; with the date too when it wasn't the puzzle's own day. */
  function finished(at: string): string {
    const when = new Date(at);
    const date = /(\d{4}-\d{2}-\d{2})$/.exec(puzzleId)?.[1];
    const local = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;
    return date === undefined || date === local
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
  <h2 id="board-title">Leaderboard</h2>
  {#if board === undefined}
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
                <th scope="row"
                  >{entry.nickname}{#if entry.isYou}{' '}<span class="tag">(you)</span>{/if}</th
                >
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
