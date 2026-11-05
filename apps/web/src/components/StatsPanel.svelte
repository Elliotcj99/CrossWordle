<script lang="ts">
  import { onMount } from 'svelte';
  import { NAUGHTY, NORMAL, type Collection } from '../lib/collections';
  import { localDate } from '../lib/dates';
  import { loadResults, onResultsChanged } from '../lib/results';
  import { historyFor, statsFor } from '../lib/stats';
  import StatsList from './StatsList.svelte';

  /**
   * The player's stats: totals and streaks for the daily puzzles and the Naughty ones apart, and
   * each puzzle they've finished, linking to it (a finished puzzle opens as it ended). From this
   * browser's results, which include the server's record where it keeps one (the game merges
   * them in when the page loads).
   */

  let results = $state.raw(loadResults());
  onMount(() => onResultsChanged(() => (results = loadResults())));

  const today = localDate();
  const groups = $derived(
    [
      { title: 'Daily', collection: NORMAL },
      { title: 'Naughty', collection: NAUGHTY },
    ].map((group) => ({
      ...group,
      stats: statsFor(results, group.collection, today),
      history: historyFor(results, group.collection),
    })),
  );
  const empty = $derived(groups.every((group) => group.history.length === 0));

  /** A day as people read it, e.g. "Tue 3 Nov 2026". */
  function dayName(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function puzzleName(id: string, date: string | undefined, collection: Collection): string {
    if (date !== undefined) return dayName(date);
    return collection === NORMAL && id === 'sample' ? 'Sample puzzle' : id;
  }
</script>

<div class="stats-panel">
  {#if empty}
    <p class="panel">
      You haven't got any recorded stats yet. Finish a puzzle and they'll show here.
    </p>
  {:else}
    {#each groups as group (group.title)}
      <section class="panel" aria-labelledby="stats-{group.collection.mode}">
        <h2 id="stats-{group.collection.mode}">{group.title}</h2>
        {#if group.history.length === 0}
          <p class="note">No {group.title} puzzles finished yet.</p>
        {:else}
          <StatsList stats={group.stats} />
          {#if group.stats.averageGuesses !== undefined}
            <p class="note centred">
              {group.stats.averageGuesses.toFixed(1)} guesses on average for a win
            </p>
          {/if}
          <h3>Past puzzles</h3>
          <ul aria-label="{group.title} puzzles you've finished">
            {#each group.history as past (past.puzzleId)}
              <li>
                <a href="#{encodeURIComponent(past.puzzleId)}"
                  >{puzzleName(past.puzzleId, past.date, group.collection)}</a
                >
                <span class:won={past.won} class="outcome">
                  {past.won ? `Won in ${past.guesses} guesses` : 'Out of guesses'}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/each}
  {/if}
</div>

<style>
  /* Daily and Naughty side by side where there's room. */
  .stats-panel {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: 16px;
    align-items: start;
  }

  .panel {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 12px 16px;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 8px;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  h3 {
    margin: 4px 0 0;
    font-size: 0.9rem;
  }

  p {
    margin: 0;
  }

  .note {
    color: var(--ink-muted);
  }

  .centred {
    text-align: center;
  }

  /* A long history scrolls inside the panel rather than pushing the puzzle down. */
  ul {
    display: grid;
    max-height: 16rem;
    overflow-y: auto;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px 12px;
    padding: 6px 0;
    border-top: 1px solid var(--rule);
  }

  a {
    color: inherit;
    font-weight: 700;
  }

  .outcome {
    color: var(--ink-muted);
  }

  .outcome.won {
    color: var(--ink);
  }
</style>
