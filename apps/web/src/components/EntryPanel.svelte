<script lang="ts">
  import type {
    ClientEntry,
    DraftCells,
    GuessBudget,
    Mark,
    RevealedCell,
    ScoredLetter,
  } from '@crosswordle/engine';

  interface Props {
    entry: ClientEntry;
    feedback: readonly (readonly ScoredLetter[])[];
    draft: DraftCells;
    solved: boolean;
    remaining: number;
    total: number;
    budgetKind: GuessBudget['kind'];
    /** The revealed second (crossword) clue, or undefined if it hasn't been revealed. */
    secondClue: string | undefined;
    /** The Wordle-clue row (own greens + the one starred hint), or undefined if none is revealed. */
    clueRow: (RevealedCell | undefined)[] | undefined;
    canRevealCrossword: boolean;
    canRevealWordle: boolean;
    hinting: boolean;
    oncrosswordclue: () => void;
    onwordleclue: () => void;
    message: string;
  }

  let {
    entry,
    feedback,
    draft,
    solved,
    remaining,
    total,
    budgetKind,
    secondClue,
    clueRow,
    canRevealCrossword,
    canRevealWordle,
    hinting,
    oncrosswordclue,
    onwordleclue,
    message,
  }: Props = $props();

  let confirming = $state<'crossword' | 'wordle' | null>(null);

  // Clear a pending confirmation when the player switches entry.
  $effect(() => {
    void entry.id;
    confirming = null;
  });

  const markText: Record<Mark, string> = {
    correct: 'correct',
    present: 'in the word',
    absent: 'not in the word',
  };

  function tileLabel(letter: ScoredLetter): string {
    const count =
      letter.answerCount === undefined
        ? ''
        : `, the answer has ${letter.answerCount} ${letter.letter}s`;
    return `${letter.letter}, ${markText[letter.mark]}${count}`;
  }

  function confirmClue() {
    if (confirming === 'crossword') oncrosswordclue();
    else if (confirming === 'wordle') onwordleclue();
    confirming = null;
  }
</script>

<div class="panel">
  <p class="eyebrow">
    {entry.number}
    {entry.direction === 'across' ? 'Across' : 'Down'} · {entry.length} letters
  </p>
  <h2 class="clue">{entry.clue}</h2>
  {#if secondClue}
    <p class="clue2"><span class="star" aria-hidden="true">*</span> {secondClue}</p>
  {/if}

  {#if confirming}
    <p class="clue-confirm" role="status">
      Reveal the {confirming === 'crossword' ? 'crossword' : 'Wordle'} clue?
      <button type="button" class="link strong" onclick={confirmClue}>Reveal</button>
      <button type="button" class="link" onclick={() => (confirming = null)}>Cancel</button>
    </p>
  {:else if canRevealCrossword || canRevealWordle}
    <div class="clue-buttons">
      {#if canRevealCrossword}
        <button type="button" class="hint" onclick={() => (confirming = 'crossword')}>
          Crossword clue
        </button>
      {/if}
      {#if canRevealWordle}
        <button
          type="button"
          class="hint"
          disabled={hinting}
          onclick={() => (confirming = 'wordle')}
        >
          {hinting ? 'Revealing…' : 'Wordle clue'}
        </button>
      {/if}
    </div>
  {/if}

  {#if clueRow}
    <div class="clue-reveal" aria-label="Revealed letters">
      {#each clueRow as cell, i (i)}
        <span
          class="clue-tile"
          class:filled={cell !== undefined}
          class:blank={cell === undefined}
          aria-label={cell === undefined
            ? `Position ${i + 1}, hidden`
            : `Position ${i + 1}, ${cell.letter}${cell.starred ? ', clue' : ''}`}
        >
          {cell?.letter ?? ''}
          {#if cell?.starred}<span class="star-badge" aria-hidden="true">*</span>{/if}
        </span>
      {/each}
    </div>
  {/if}

  <ol class="rows" aria-label="Guesses for {entry.id}">
    {#each feedback as row, r (r)}
      <li class="row">
        {#each row as letter, i (i)}
          <span class="tile {letter.mark}" aria-label={tileLabel(letter)}>
            {letter.letter}
            {#if letter.answerCount !== undefined}
              <span class="badge" aria-hidden="true">{letter.answerCount}</span>
            {/if}
          </span>
        {/each}
      </li>
    {/each}

    {#if !solved}
      <li class="row" aria-label="Current guess">
        {#each draft.letters as letter, i (i)}
          <span
            class="tile draft"
            class:filled={letter !== undefined}
            class:cursor={i === draft.cursor}>{letter ?? ''}</span
          >
        {/each}
      </li>
    {/if}
  </ol>

  {#if solved}
    <p class="solved">Solved in {feedback.length} {feedback.length === 1 ? 'guess' : 'guesses'}.</p>
  {/if}

  <div class="budget">
    <div class="meter" aria-hidden="true">
      <span style:width="{(Math.max(remaining, 0) / total) * 100}%"></span>
    </div>
    <p>
      <b>{remaining}</b> of {total}
      {total === 1 ? 'guess' : 'guesses'} left {budgetKind === 'shared'
        ? 'for the whole puzzle'
        : 'for this entry'}
    </p>
  </div>
  <p class="message" role="status" aria-live="polite">{message}</p>
</div>

<style>
  .panel {
    container-type: inline-size;
  }

  .eyebrow {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .clue {
    margin: 4px 0 8px;
    font-size: 1.35rem;
    line-height: 1.25;
    text-wrap: balance;
  }

  .clue2 {
    margin: 0 0 12px;
    font-size: 1rem;
    line-height: 1.3;
    color: var(--ink-muted);
    text-wrap: balance;
  }

  .star,
  .star-badge {
    font-weight: 800;
    color: var(--present);
  }

  .clue-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 16px;
  }

  .hint {
    padding: 6px 12px;
    border: 2px solid var(--rule);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
  }

  .hint:hover {
    border-color: var(--ink-muted);
  }

  .hint:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .clue-confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    margin: 0 0 16px;
    font-weight: 700;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-muted);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .link.strong {
    color: var(--ink);
  }

  .clue-reveal {
    display: flex;
    gap: 6px;
    margin: 0 0 10px;
  }

  .clue-tile {
    position: relative;
    display: grid;
    place-items: center;
    width: min(48px, calc((100cqi - 9 * 6px) / 10));
    aspect-ratio: 1;
    border: 2px dashed var(--rule);
    border-radius: 4px;
    background: var(--surface);
    font-family: var(--font-display);
    font-weight: 700;
    font-stretch: 110%;
    font-size: 1.35rem;
  }

  .clue-tile.blank {
    background: var(--rule);
    opacity: 0.5;
  }

  .clue-tile.filled {
    border-style: solid;
    border-color: var(--correct);
    background: var(--correct);
    color: var(--on-mark);
  }

  .star-badge {
    position: absolute;
    top: -6px;
    right: -4px;
    font-size: 1rem;
    line-height: 1;
    color: var(--on-mark);
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }

  .row {
    display: flex;
    gap: 6px;
  }

  .tile {
    position: relative;
    display: grid;
    place-items: center;
    /* Room for the longest entry (10 letters) in the panel's width. */
    width: min(48px, calc((100cqi - 9 * 6px) / 10));
    aspect-ratio: 1;
    border: 2px solid var(--rule);
    border-radius: 4px;
    background: var(--surface);
    font-family: var(--font-display);
    font-weight: 700;
    font-stretch: 110%;
    font-size: 1.35rem;
  }

  .tile.correct,
  .tile.present,
  .tile.absent {
    color: var(--on-mark);
    animation: flip 300ms ease-out both;
  }

  .tile.correct {
    background: var(--correct);
    border-color: var(--correct);
  }

  .tile.present {
    background: var(--present);
    border-color: var(--present);
  }

  .tile.absent {
    background: var(--absent);
    border-color: var(--absent);
  }

  .tile.filled {
    border-color: var(--ink-muted);
  }

  .tile.cursor {
    border-color: var(--cursor);
    box-shadow: 0 0 0 2px var(--cursor);
  }

  .badge {
    position: absolute;
    top: -7px;
    right: -7px;
    display: grid;
    place-items: center;
    min-width: 19px;
    height: 19px;
    padding: 0 4px;
    border-radius: 10px;
    background: var(--ink);
    color: var(--paper);
    font-family: var(--font-body);
    font-size: 0.72rem;
    font-weight: 700;
    font-stretch: 100%;
  }

  .solved {
    margin: 12px 0 0;
    font-weight: 700;
    color: var(--correct);
  }

  .budget {
    margin-top: 16px;
  }

  .budget p {
    margin: 6px 0 0;
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }

  .budget b {
    color: var(--ink);
  }

  .meter {
    height: 6px;
    border-radius: 3px;
    background: var(--rule);
    overflow: hidden;
  }

  .meter span {
    display: block;
    height: 100%;
    background: var(--ink);
    transition: width 200ms ease;
  }

  .message {
    min-height: 1.5em;
    margin: 8px 0 0;
    font-weight: 700;
  }

  @keyframes flip {
    from {
      transform: rotateX(90deg);
    }
    to {
      transform: rotateX(0);
    }
  }
</style>
