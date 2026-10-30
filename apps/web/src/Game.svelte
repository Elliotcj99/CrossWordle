<script lang="ts">
  import {
    bestMarks,
    cellKey,
    checkGuess,
    computeStats,
    crosswordClueShown,
    deleteLetter,
    draftCells,
    draftWord,
    emptyDraft,
    feedbackFor,
    gameStatus,
    guessCount,
    guessesRemaining,
    guessLimit,
    hasSecondClue,
    isSolved,
    lockedLetters,
    newGame,
    recordCrosswordClue,
    recordGuess,
    recordWordleClue,
    shareText,
    type Cell,
    type ClientEntry,
    type ClientPuzzle,
    type Draft,
    type GameState,
    type ScoredLetter,
    type WordChecker,
    typeLetter,
    wordleClueFor,
    wordleClueRow,
    wordOf,
  } from '@crosswordle/engine';
  import { untrack } from 'svelte';
  import Clues from './components/Clues.svelte';
  import EndPanel from './components/EndPanel.svelte';
  import EntryPanel from './components/EntryPanel.svelte';
  import Grid from './components/Grid.svelte';
  import Keyboard from './components/Keyboard.svelte';
  import { requestHint, scoreGuess, ScoringError } from './lib/api';
  import { localDate } from './lib/dates';
  import { guessErrorText } from './lib/messages';
  import { loadResults, recordResult } from './lib/results';
  import { loadGame, saveGame } from './lib/storage';

  let { puzzle, isWord }: { puzzle: ClientPuzzle; isWord: WordChecker | undefined } = $props();

  // A Game is created for one puzzle (App keys it by puzzle id), so the initial values are read
  // once on purpose. The engine returns new objects on every change, so raw state is enough.
  let game = $state.raw<GameState>(untrack(() => loadGame(puzzle) ?? newGame(puzzle)));
  let selectedId = $state(untrack(() => firstUnsolved(game)?.id ?? puzzle.entries[0]!.id));
  let draft = $state.raw<Draft>(emptyDraft());
  let message = $state('');
  let confirmingRestart = $state(false);
  let submitting = $state(false);
  let hinting = $state(false);
  let results = $state.raw(loadResults());
  let boardEl = $state<HTMLElement>();

  const locks = $derived(lockedLetters(puzzle, game));
  const status = $derived(gameStatus(puzzle, game));
  const selected = $derived(entryById(selectedId));
  const length = $derived(selected.length);
  const cells = $derived(draftCells(draft, length));
  const feedback = $derived(feedbackFor(game, selected));
  const solvedIds = $derived(
    new Set(puzzle.entries.filter((e) => isSolved(game, e)).map((e) => e.id)),
  );
  const guessCounts = $derived(new Map(puzzle.entries.map((e) => [e.id, guessCount(game, e)])));
  const stats = $derived(computeStats(results, localDate()));

  // Clue hints for the selected entry (both free, and kept until restart).
  const secondClue = $derived(crosswordClueShown(game, selected) ? selected.clue2 : undefined);
  const clueRow = $derived(wordleClueRow(game, selected));
  const canRevealCrossword = $derived(
    status === 'playing' && hasSecondClue(selected) && !crosswordClueShown(game, selected),
  );
  const canRevealWordle = $derived(
    status === 'playing' &&
      !solvedIds.has(selected.id) &&
      wordleClueFor(game, selected) === undefined,
  );
  const crosswordClueIds = $derived(new Set(game.crosswordClues ?? []));

  $effect(() => saveGame(game));

  // Record the result once the puzzle ends; the first result for a puzzle stands.
  $effect(() => {
    if (status === 'playing') return;
    const used = puzzle.entries.reduce((sum, e) => sum + guessCount(game, e), 0);
    results = recordResult(puzzle.id, { won: status === 'won', guesses: used });
  });

  function entryById(id: string): ClientEntry {
    return puzzle.entries.find((e) => e.id === id)!;
  }

  function firstUnsolved(state: GameState): ClientEntry | undefined {
    return puzzle.entries.find((e) => !isSolved(state, e));
  }

  function select(entry: ClientEntry) {
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
    if (status !== 'playing' || solvedIds.has(selectedId) || submitting) return;
    message = '';
    if (key === 'Enter') {
      void submit();
    } else if (key === 'Backspace') {
      draft = deleteLetter(draft);
    } else if (/^[A-Za-z]$/.test(key)) {
      draft = typeLetter(draft, length, key.toUpperCase());
    }
  }

  async function submit() {
    const word = draftWord(draft, length);
    if (word === undefined) {
      message = guessErrorText['wrong-length'];
      return;
    }
    const check = checkGuess(puzzle, game, selectedId, word, isWord);
    if (!check.ok) {
      message = guessErrorText[check.error];
      return;
    }

    // Scoring happens on the server so the answer never reaches the page.
    submitting = true;
    message = '';
    try {
      const scored = await scoreGuess(puzzle.id, check.entry.id, check.guess);
      game = recordGuess(game, check.entry, scored.letters);
      const next = scored.solved ? firstUnsolved(game) : undefined;
      if (next !== undefined) select(next);
      else draft = emptyDraft();
      message = summary(check.entry, check.guess, scored.solved, scored.letters);
    } catch (error) {
      message =
        error instanceof ScoringError
          ? 'Could not score that guess — check your connection and try again.'
          : 'Something went wrong scoring that guess.';
    } finally {
      submitting = false;
    }
  }

  /** What the guess found, in words, so screen reader users hear the result too. */
  function summary(
    entry: ClientEntry,
    word: string,
    solved: boolean,
    letters: readonly ScoredLetter[],
  ): string {
    const name = `${entry.number} ${entry.direction === 'across' ? 'Across' : 'Down'}`;
    if (solved) return `${word} solves ${name}.`;
    const greens = letters.filter((l) => l.mark === 'correct').length;
    const yellows = letters.filter((l) => l.mark === 'present').length;
    return `${word}: ${greens} green, ${yellows} yellow.`;
  }

  function revealCrosswordClue() {
    game = recordCrosswordClue(game, selected);
  }

  async function revealWordleClue() {
    if (hinting || wordleClueFor(game, selected) !== undefined) return;
    hinting = true;
    message = '';
    try {
      const guesses = feedbackFor(game, selected).map(wordOf);
      const result = await requestHint(puzzle.id, selected.id, guesses);
      if (result.ok) {
        game = recordWordleClue(game, selected, result.hint);
      } else {
        message =
          result.reason === 'none'
            ? 'No new letter to reveal.'
            : 'Could not get a hint — check your connection and try again.';
      }
    } finally {
      hinting = false;
    }
  }

  function restart() {
    game = newGame(puzzle);
    confirmingRestart = false;
    select(puzzle.entries[0]!);
  }

  /** The single-column phone layout, where the grid and the clue list are far apart. */
  function isPhone(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 859px)').matches;
  }

  /** Moves to the next or previous entry in the puzzle's order (1, 2, 3…, across before down). */
  function step(delta: number) {
    const i = puzzle.entries.findIndex((e) => e.id === selectedId);
    const count = puzzle.entries.length;
    select(puzzle.entries[(i + delta + count) % count]!);
  }

  /** Selecting from the clue list jumps back up to the grid on a phone, to save scrolling. */
  function selectFromClues(entry: ClientEntry) {
    select(entry);
    if (isPhone()) boardEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  <section class="board" aria-label="Crossword" bind:this={boardEl}>
    <Grid
      {puzzle}
      {locks}
      {selected}
      draft={cells.letters}
      cursor={cells.cursor}
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
      {secondClue}
      {clueRow}
      {canRevealCrossword}
      {canRevealWordle}
      {hinting}
      oncrosswordclue={revealCrosswordClue}
      onwordleclue={revealWordleClue}
      onprev={() => step(-1)}
      onnext={() => step(1)}
      {message}
    />
    <Keyboard marks={bestMarks(feedback.flat())} onkey={press} />
  </section>

  <section class="clues" aria-label="Clues">
    <Clues
      entries={puzzle.entries}
      {selectedId}
      {solvedIds}
      {guessCounts}
      shownClue2Ids={crosswordClueIds}
      onselect={selectFromClues}
    />
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
