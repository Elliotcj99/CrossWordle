<script lang="ts">
  import type { DraftCells, Entry, GuessBudget, Mark, ScoredLetter } from '@crosswordle/engine';

  interface Props {
    entry: Entry;
    feedback: ScoredLetter[][];
    draft: DraftCells;
    solved: boolean;
    remaining: number;
    total: number;
    budgetKind: GuessBudget['kind'];
    message: string;
  }

  let { entry, feedback, draft, solved, remaining, total, budgetKind, message }: Props = $props();

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
</script>

<div class="panel">
  <p class="eyebrow">
    {entry.number}
    {entry.direction === 'across' ? 'Across' : 'Down'} · {entry.answer.length} letters
  </p>
  <h2 class="clue">{entry.clue}</h2>

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
    margin: 4px 0 16px;
    font-size: 1.35rem;
    line-height: 1.25;
    text-wrap: balance;
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
