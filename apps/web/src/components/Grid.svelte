<script lang="ts">
  import {
    cellKey,
    gridCells,
    type Cell,
    type ClientEntry,
    type ClientPuzzle,
  } from '@crosswordle/engine';

  interface Props {
    puzzle: ClientPuzzle;
    locks: ReadonlyMap<string, string>;
    selected: ClientEntry;
    /** The selected entry's letters as typed so far, cell by cell. */
    draft: readonly (string | undefined)[];
    /** Index in the selected entry of the cell the next letter goes into. */
    cursor: number;
    onselectcell: (cell: Cell) => void;
  }

  let { puzzle, locks, selected, draft, cursor, onselectcell }: Props = $props();

  const cells = $derived(gridCells(puzzle));
  const selectedKeys = $derived(new Set(selected.cells.map(cellKey)));
  const draftByKey = $derived(new Map(selected.cells.map((cell, i) => [cellKey(cell), draft[i]])));
  const cursorKey = $derived(
    cursor < selected.cells.length ? cellKey(selected.cells[cursor]!) : undefined,
  );

  function letterAt(key: string): string {
    return locks.get(key) ?? draftByKey.get(key) ?? '';
  }
</script>

<div
  class="grid"
  style:--cols={puzzle.width}
  style:--rows={puzzle.height}
  role="group"
  aria-label="Crossword grid, {puzzle.width} by {puzzle.height}"
>
  {#each cells as cell (cell.key)}
    {@const letter = letterAt(cell.key)}
    <button
      type="button"
      class="cell"
      class:selected={selectedKeys.has(cell.key)}
      class:cursor={cell.key === cursorKey}
      class:locked={locks.has(cell.key)}
      style:grid-row={cell.row + 1}
      style:grid-column={cell.col + 1}
      aria-label="{cell.number === undefined ? '' : `${cell.number}, `}row {cell.row +
        1}, column {cell.col + 1}{letter ? `, ${letter}` : ', empty'}"
      onclick={() => onselectcell(cell)}
    >
      {#if cell.number !== undefined}<span class="number" aria-hidden="true">{cell.number}</span
        >{/if}
      <span class="letter" aria-hidden="true">{letter}</span>
    </button>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    grid-template-rows: repeat(var(--rows), auto);
    gap: 2px;
    padding: 2px;
    width: 100%;
    max-width: calc(var(--cols) * 52px);
    background: var(--block);
  }

  .cell {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    max-width: 100%;
    padding: 0;
    border: 0;
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .cell.selected {
    background: var(--select);
  }

  .cell.cursor {
    background: var(--cursor);
  }

  .cell.locked {
    background: var(--correct);
    color: var(--on-mark);
  }

  .number {
    position: absolute;
    top: 2px;
    left: 3px;
    font-size: clamp(0.5rem, 1.6vw, 0.7rem);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .letter {
    font-family: var(--font-display);
    font-weight: 700;
    font-stretch: 110%;
    font-size: clamp(0.85rem, 3.6vw, 1.45rem);
    line-height: 1;
  }
</style>
