<script lang="ts">
  import type { ClientEntry } from '@crosswordle/engine';

  interface Props {
    entries: readonly ClientEntry[];
    selectedId: string;
    solvedIds: ReadonlySet<string>;
    /** Guesses used so far on each entry. */
    guessCounts: ReadonlyMap<string, number>;
    /** Entry ids whose second clue has been revealed, to show under the first. */
    shownClue2Ids: ReadonlySet<string>;
    onselect: (entry: ClientEntry) => void;
  }

  let { entries, selectedId, solvedIds, guessCounts, shownClue2Ids, onselect }: Props = $props();

  const groups = $derived([
    { title: 'Across', entries: entries.filter((e) => e.direction === 'across') },
    { title: 'Down', entries: entries.filter((e) => e.direction === 'down') },
  ]);

  function status(entry: ClientEntry): string {
    const used = guessCounts.get(entry.id) ?? 0;
    if (solvedIds.has(entry.id)) return `Solved in ${used}`;
    return used === 0 ? '' : `${used} ${used === 1 ? 'guess' : 'guesses'}`;
  }
</script>

<div class="clues">
  {#each groups as group (group.title)}
    <div>
      <h2>{group.title}</h2>
      <ol>
        {#each group.entries as entry (entry.id)}
          <li>
            <button
              type="button"
              class:selected={entry.id === selectedId}
              class:solved={solvedIds.has(entry.id)}
              aria-current={entry.id === selectedId ? 'true' : undefined}
              onclick={() => onselect(entry)}
            >
              <span class="number">{entry.number}</span>
              <span class="text">
                {entry.clue} <span class="length">({entry.length})</span>
                {#if shownClue2Ids.has(entry.id) && entry.clue2}
                  <span class="clue2"
                    ><span class="star" aria-hidden="true">*</span> {entry.clue2}</span
                  >
                {/if}
              </span>
              <span class="status">{status(entry)}</span>
            </button>
          </li>
        {/each}
      </ol>
    </div>
  {/each}
</div>

<style>
  .clues {
    display: grid;
    gap: 24px;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  h2 {
    margin: 0 0 8px;
    padding-bottom: 6px;
    border-bottom: 2px solid var(--ink);
    font-family: var(--font-display);
    font-size: 0.85rem;
    font-weight: 800;
    font-stretch: 125%;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  button {
    display: grid;
    grid-template-columns: 2em minmax(0, 1fr) auto;
    gap: 8px;
    align-items: baseline;
    width: 100%;
    padding: 8px;
    border: 0;
    border-bottom: 1px solid var(--rule);
    background: none;
    text-align: left;
    cursor: pointer;
  }

  button.selected {
    background: var(--select);
  }

  button.solved .text {
    color: var(--ink-muted);
    text-decoration: line-through;
    text-decoration-color: var(--correct);
    text-decoration-thickness: 2px;
  }

  .number {
    font-family: var(--font-display);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .length {
    color: var(--ink-muted);
  }

  .clue2 {
    display: block;
    margin-top: 2px;
    font-size: 0.85rem;
    color: var(--ink-muted);
  }

  .star {
    font-weight: 800;
    color: var(--present);
  }

  .status {
    font-size: 0.8rem;
    color: var(--ink-muted);
    white-space: nowrap;
  }

  button.solved .status {
    color: var(--correct);
    font-weight: 700;
  }
</style>
