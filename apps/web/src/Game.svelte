<script lang="ts">
  import {
    bestMarks,
    cellKey,
    computeStats,
    deleteLetter,
    draftCells,
    draftWord,
    emptyDraft,
    feedbackFor,
    gameStatus,
    guessesFor,
    guessesRemaining,
    guessLimit,
    isSolved,
    lockedLetters,
    newGame,
    shareText,
    submitGuess,
    typeLetter,
    type Cell,
    type Draft,
    type Entry,
    type GameState,
    type Puzzle,
    type WordChecker,
  } from '@crosswordle/engine';
  import { untrack } from 'svelte';
  import Clues from './components/Clues.svelte';
  import EndPanel from './components/EndPanel.svelte';
  import EntryPanel from './components/EntryPanel.svelte';
  import Grid from './components/Grid.svelte';
  import Keyboard from './components/Keyboard.svelte';
  import { localDate } from './lib/dates';
  import { guessErrorText } from './lib/messages';
  import { loadResults, recordResult } from './lib/results';
  import { loadGame, saveGame } from './lib/storage';

  let { puzzle, isWord }: { puzzle: Puzzle; isWord: WordChecker | undefined } = $props();

  // A Game is created for one puzzle (App keys it by puzzle id), so the initial values are read
  // once on purpose. The engine returns new objects on every change, so raw state is enough.
  let game = $state.raw<GameState>(untrack(() => loadGame(puzzle) ?? newGame(puzzle)));
  let selectedId = $state(untrack(() => firstUnsolved(game)?.id ?? puzzle.entries[0]!.id));
  let draft = $state.raw<Draft>(emptyDraft());
  let message = $state('');
  let confirmingRestart = $state(false);
  let results = $state.raw(loadResults());

  const locks = $derived(lockedLetters(puzzle, game));
  const status = $derived(gameStatus(puzzle, game));
  const selected = $derived(entryById(selectedId));
  const length = $derived(selected.answer.length);
  const cells = $derived(draftCells(draft, length));
  const feedback = $derived(feedbackFor(puzzle, game, selected));
  const solvedIds = $derived(
    new Set(puzzle.entries.filter((e) => isSolved(game, e)).map((e) => e.id)),
  );
  const guessCounts = $derived(
    new Map(puzzle.entries.map((e) => [e.id, guessesFor(game, e).length])),
  );
  const stats = $derived(computeStats(results, localDate()));

  $effect(() => saveGame(game));

  // Record the result once the puzzle ends; the first result for a puzzle stands.
  $effect(() => {
    if (status === 'playing') return;
    const used = puzzle.entries.reduce((sum, e) => sum + guessesFor(game, e).length, 0);
    results = recordResult(puzzle.id, { won: status === 'won', guesses: used });
  });

  function entryById(id: string): Entry {
    return puzzle.entries.find((e) => e.id === id)!;
  }

  function firstUnsolved(state: GameState): Entry | undefined {
    return puzzle.entries.find((e) => !isSolved(state, e));
  }

  function select(entry: Entry) {
    selectedId = entry.id;
    draft = emptyDraft();
    message = '';
  }

  /** Tapping a cell picks its entry; tapping the selected entry again switches to its crossing. */
  function selectCell(cell: Cell) {
    const key = cellKey(cell);
    const containing = puzzle.entries.filter((e) => e.cells.some((c) => cellKey(c) === key));
    const other = containing.find((e) => e.id !== selectedId);
    const next = containing.some((e) => e.id === selectedId) ? (other ?? selected) : containing[0];
    if (next !== undefined && next.id !== selectedId) select(next);
  }

  function press(key: string) {
    if (status !== 'playing' || solvedIds.has(selectedId)) return;
    message = '';
    if (key === 'Enter') {
      submit();
    } else if (key === 'Backspace') {
      draft = deleteLetter(draft);
    } else if (/^[A-Za-z]$/.test(key)) {
      draft = typeLetter(draft, length, key.toUpperCase());
    }
  }

  function submit() {
    const word = draftWord(draft, length);
    if (word === undefined) {
      message = guessErrorText['wrong-length'];
      return;
    }
    const result = submitGuess(puzzle, game, selectedId, word, isWord);
    if (!result.ok) {
      message = guessErrorText[result.error];
      return;
    }
    const guessed = selected;
    game = result.state;

    const solvedNow = isSolved(game, guessed);
    const next = solvedNow ? firstUnsolved(game) : undefined;
    if (next !== undefined) select(next);
    else draft = emptyDraft();
    message = summary(guessed, word, solvedNow);
  }

  /** What the guess found, in words, so screen reader users hear the result too. */
  function summary(entry: Entry, word: string, solved: boolean): string {
    const name = `${entry.number} ${entry.direction === 'across' ? 'Across' : 'Down'}`;
    if (solved) return `${word} solves ${name}.`;
    const marks = feedbackFor(puzzle, game, entry).at(-1) ?? [];
    const greens = marks.filter((l) => l.mark === 'correct').length;
    const yellows = marks.filter((l) => l.mark === 'present').length;
    return `${word}: ${greens} green, ${yellows} yellow.`;
  }

  function restart() {
    game = newGame(puzzle);
    confirmingRestart = false;
    select(puzzle.entries[0]!);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Enter' || event.key === 'Backspace' || /^[A-Za-z]$/.test(event.key)) {
      event.preventDefault();
      press(event.key);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="puzzle-bar">
  <p class="title">
    {puzzle.title}
    <span class="progress">{solvedIds.size} of {puzzle.entries.length} solved</span>
  </p>
  {#if confirmingRestart}
    <p class="confirm">
      Clear every guess and start again?
      <button type="button" class="link danger" onclick={restart}>Restart</button>
      <button type="button" class="link" onclick={() => (confirmingRestart = false)}
        >Keep playing</button
      >
    </p>
  {:else}
    <button type="button" class="link" onclick={() => (confirmingRestart = true)}>Restart</button>
  {/if}
</div>

{#if status !== 'playing'}
  <EndPanel {status} {stats} share={shareText(puzzle, game)} />
{/if}

<div class="layout">
  <section class="board" aria-label="Crossword">
    <Grid
      {puzzle}
      {locks}
      {selected}
      draft={cells.letters}
      cursor={cells.cursor}
      reveal={status === 'lost'}
      onselectcell={selectCell}
    />
  </section>

  <section class="play" aria-label="Current entry">
    <EntryPanel
      entry={selected}
      {feedback}
      draft={cells}
      solved={solvedIds.has(selected.id)}
      remaining={guessesRemaining(puzzle, game, selected)}
      total={guessLimit(puzzle, selected)}
      budgetKind={puzzle.rules.guessBudget.kind}
      {message}
    />
    <Keyboard marks={bestMarks(feedback.flat())} onkey={press} />
  </section>

  <section class="clues" aria-label="Clues">
    <Clues entries={puzzle.entries} {selectedId} {solvedIds} {guessCounts} onselect={select} />
  </section>
</div>

<style>
  .puzzle-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px 16px;
    margin-bottom: 16px;
  }

  .title {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.1rem;
  }

  .progress {
    margin-left: 8px;
    font-family: var(--font-body);
    font-weight: 400;
    font-size: 0.9rem;
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }

  .confirm {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: baseline;
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

  .link.danger {
    color: var(--ink);
    font-weight: 700;
  }

  .layout {
    display: grid;
    gap: 28px;
    grid-template-columns: minmax(0, 1fr);
  }

  @media (min-width: 860px) {
    .layout {
      grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      align-items: start;
    }

    .clues {
      grid-column: 1 / -1;
    }
  }
</style>
