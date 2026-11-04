<script lang="ts">
  import {
    bestMarks,
    canRevealWordleClue,
    cellKey,
    checkGuess,
    clueOrder,
    computeStats,
    crosswordClueFor,
    deleteLetter,
    draftCells,
    draftWord,
    emptyDraft,
    feedbackFor,
    gameStatus,
    gameSummary,
    gridLetters,
    guessCount,
    guessesRemaining,
    guessLimit,
    hasSecondClue,
    isSolved,
    lockedLetters,
    newGame,
    nextUnsolved,
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
  import { onMount, untrack } from 'svelte';
  import Clues from './components/Clues.svelte';
  import EndPanel from './components/EndPanel.svelte';
  import EntryPanel from './components/EntryPanel.svelte';
  import Grid from './components/Grid.svelte';
  import Keyboard from './components/Keyboard.svelte';
  import Leaderboard from './components/Leaderboard.svelte';
  import {
    fetchGame,
    fetchRecord,
    reportRestart,
    requestCrosswordClue,
    requestHint,
    scoreGuess,
    ScoringError,
  } from './lib/api';
  import { localDate } from './lib/dates';
  import { features } from './lib/features';
  import { guessErrorText } from './lib/messages';
  import { loadResults, mergeResults, recordResult } from './lib/results';
  import {
    clearCluesToFetch,
    clearRestartPending,
    clueFetched,
    loadGame,
    markRestartPending,
    pendingRestart,
    readSavedGame,
    saveGame,
  } from './lib/storage';
  import { preferServerGame } from './lib/sync';

  let { puzzle, isWord }: { puzzle: ClientPuzzle; isWord: WordChecker | undefined } = $props();

  // A Game is created for one puzzle (App keys it by puzzle id), so the initial values are read
  // once on purpose. The engine returns new objects on every change, so raw state is enough.
  // `order` is the entries as the clue list shows them; every move between clues follows it.
  const order = clueOrder(untrack(() => puzzle));
  const saved = untrack(() => loadGame(puzzle));
  let game = $state.raw<GameState>(saved?.game ?? untrack(() => newGame(puzzle)));
  let selectedId = $state(untrack(() => (nextUnsolved(puzzle, game) ?? order[0]!).id));
  let draft = $state.raw<Draft>(emptyDraft());
  let message = $state('');
  let confirmingRestart = $state(false);
  let submitting = $state(false);
  /** The clue being fetched from the server, if any. One at a time. */
  let revealing = $state<'crossword' | 'wordle' | null>(null);
  let results = $state.raw(loadResults());
  let boardEl = $state<HTMLElement>();
  /** Whether this host has leaderboards, and whether the player has opened this one. */
  let hasBoard = $state(false);
  let boardOpen = $state(false);
  /** Bumped when the board may have changed (the player named themselves), to fetch it again. */
  let boardVersion = $state(0);
  /**
   * Bumped by every restart. An answer from the server (a scored guess, a clue) that comes back
   * after a restart belongs to the game before it, so it's dropped.
   */
  let generation = 0;
  /** Whether the player has done anything since the page loaded (see the server-copy check). */
  let touched = false;

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
  const secondClue = $derived(crosswordClueFor(game, selected));
  const clueRow = $derived(wordleClueRow(puzzle, game, selected, locks));
  const canRevealCrossword = $derived(
    status === 'playing' && hasSecondClue(selected) && secondClue === undefined,
  );
  // Only offer a Wordle clue while it can reveal a letter the player can't already see.
  const canRevealWordle = $derived(
    status === 'playing' && canRevealWordleClue(game, selected, locks),
  );
  const secondClues = $derived(game.crosswordClues ?? {});
  // Finished players always see the board; while playing it's opened from the puzzle bar.
  const showBoard = $derived(hasBoard && (status !== 'playing' || boardOpen));

  $effect(() => saveGame(game));

  // Where the server keeps records, it's the player's record across devices: carry on from its
  // copy of this game if it's further on (played elsewhere, or a restored record), and add its
  // finished puzzles to the stats.
  onMount(async () => {
    const host = await features();
    hasBoard = host.names.has('leaderboard');
    if (!host.names.has('records')) return;
    // A restart the server never heard about (offline) is sent first. Until it's through, the
    // server's copy is the game before the restart, which mustn't come back.
    const restartSent = await sendPendingRestart();
    const [remote, record] = await Promise.all([fetchGame(puzzle.id), fetchRecord()]);
    results = mergeResults(
      Object.fromEntries(record.map((r) => [r.puzzleId, { won: r.won, guesses: r.guesses }])),
    );
    const server = remote === undefined ? undefined : readSavedGame(remote, puzzle)?.game;
    // Only if the player hasn't done anything yet (typed, guessed, asked for a clue, restarted),
    // so nothing they did is lost or counted twice.
    if (server !== undefined && restartSent && !touched && preferServerGame(puzzle, game, server)) {
      game = server;
      select(nextUnsolved(puzzle, game) ?? order[0]!);
    }
  });

  // A game saved by an older version lists the Crossword clues it showed, without their text:
  // fetch them again, so they still show (and the server, if it keeps records, has them).
  onMount(() => {
    for (const id of saved?.cluesToFetch ?? []) {
      const entry = entryById(id);
      const asked = generation;
      void requestCrosswordClue(puzzle.id, id).then((clue) => {
        if (clue === undefined || asked !== generation) return;
        game = recordCrosswordClue(game, entry, clue);
        clueFetched(puzzle.id, id);
      });
    }
  });

  // Record the result once the puzzle ends; the first result for a puzzle stands.
  $effect(() => {
    if (status === 'playing') return;
    const { guesses } = gameSummary(puzzle, game);
    results = recordResult(puzzle.id, { won: status === 'won', guesses });
  });

  function entryById(id: string): ClientEntry {
    return puzzle.entries.find((e) => e.id === id)!;
  }

  function select(entry: ClientEntry) {
    selectedId = entry.id;
    draft = emptyDraft();
    message = '';
  }

  /**
   * Sends a restart the server hasn't heard about, before anything else about this game, so the
   * server's attempt and this page's stay the same game. False while it still can't be sent.
   */
  async function sendPendingRestart(): Promise<boolean> {
    const token = pendingRestart(puzzle.id);
    if (token === undefined) return true;
    const sent = await reportRestart(puzzle.id);
    if (sent) clearRestartPending(puzzle.id, token);
    return sent;
  }

  const OFFLINE = 'Could not reach the server — check your connection and try again.';

  /** The player picked an entry themselves (rather than the game moving on). */
  function choose(entry: ClientEntry) {
    touched = true;
    select(entry);
  }

  /** Tapping a cell picks its entry; tapping the selected entry again switches to its crossing. */
  function selectCell(cell: Cell) {
    const key = cellKey(cell);
    const containing = puzzle.entries.filter((e) => e.cells.some((c) => cellKey(c) === key));
    const other = containing.find((e) => e.id !== selectedId);
    const next = containing.some((e) => e.id === selectedId) ? (other ?? selected) : containing[0];
    if (next !== undefined && next.id !== selectedId) choose(next);
  }

  function press(key: string) {
    if (status !== 'playing' || solvedIds.has(selectedId) || submitting) return;
    touched = true;
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
    const asked = generation;
    try {
      if (!(await sendPendingRestart())) {
        message = OFFLINE;
        return;
      }
      const scored = await scoreGuess(puzzle.id, check.entry.id, check.guess);
      if (asked !== generation) return; // Restarted meanwhile: it was the old game's guess.
      game = recordGuess(game, check.entry, scored.letters);
      // Once every clue is solved there is no next one: stay on this clue and the game ends.
      const next = scored.solved ? nextUnsolved(puzzle, game, check.entry.id) : undefined;
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

  async function revealCrosswordClue() {
    if (revealing !== null || crosswordClueFor(game, selected) !== undefined) return;
    touched = true;
    revealing = 'crossword';
    message = '';
    const entry = selected;
    const asked = generation;
    try {
      if (!(await sendPendingRestart())) {
        message = OFFLINE;
        return;
      }
      const clue = await requestCrosswordClue(puzzle.id, entry.id);
      if (asked !== generation) return;
      if (clue !== undefined) game = recordCrosswordClue(game, entry, clue);
      else message = 'Could not get the clue — check your connection and try again.';
    } finally {
      revealing = null;
    }
  }

  async function revealWordleClue() {
    if (revealing !== null || wordleClueFor(game, selected) !== undefined) return;
    touched = true;
    revealing = 'wordle';
    message = '';
    // The entry asked about: the player may select another before the answer comes back.
    const entry = selected;
    const asked = generation;
    try {
      if (!(await sendPendingRestart())) {
        message = OFFLINE;
        return;
      }
      const guesses = feedbackFor(game, entry).map(wordOf);
      // The grid's letters go too, so the clue reveals something new.
      const result = await requestHint(puzzle.id, entry.id, guesses, gridLetters(entry, locks));
      if (asked !== generation) return;
      if (result.ok) {
        game = recordWordleClue(game, entry, result.hint);
      } else {
        message =
          result.reason === 'none'
            ? 'No new letter to reveal.'
            : 'Could not get a hint — check your connection and try again.';
      }
    } finally {
      revealing = null;
    }
  }

  function restart() {
    touched = true;
    generation++;
    // Marked until the server confirms it; if it doesn't hear now, the restart goes before the
    // next guess or clue (sendPendingRestart). An older save's queued clues were the old game's.
    const token = `${Date.now()}-${Math.random()}`;
    markRestartPending(puzzle.id, token);
    clearCluesToFetch(puzzle.id);
    void reportRestart(puzzle.id).then((sent) => {
      if (sent) clearRestartPending(puzzle.id, token);
    });
    game = newGame(puzzle);
    confirmingRestart = false;
    select(order[0]!);
  }

  /** The single-column phone layout, where the grid and the clue list are far apart. */
  function isPhone(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 859px)').matches;
  }

  /** Moves to the next or previous clue in the list (across before down), wrapping round. */
  function step(delta: number) {
    const i = order.findIndex((e) => e.id === selectedId);
    choose(order[(i + delta + order.length) % order.length]!);
  }

  /** Selecting from the clue list jumps back up to the grid on a phone, to save scrolling. */
  function selectFromClues(entry: ClientEntry) {
    choose(entry);
    if (isPhone()) boardEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // Keys in a form (the nickname, a feature request, a recovery code), its fields and buttons
    // alike, are for that form: Enter on its Submit button submits it.
    if (
      event.target instanceof HTMLElement &&
      event.target.closest('input, textarea, select, form')
    ) {
      return;
    }
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
    <div class="bar-actions">
      {#if hasBoard && status === 'playing'}
        <button
          type="button"
          class="link"
          aria-expanded={boardOpen}
          onclick={() => (boardOpen = !boardOpen)}
          >{boardOpen ? 'Hide leaderboard' : 'Leaderboard'}</button
        >
      {/if}
      <button type="button" class="link" onclick={() => (confirmingRestart = true)}>Restart</button>
    </div>
  {/if}
</div>

{#if status !== 'playing'}
  <EndPanel
    puzzleId={puzzle.id}
    {status}
    {stats}
    share={shareText(puzzle, game)}
    onnamed={() => boardVersion++}
  />
{/if}

{#if showBoard}
  <Leaderboard puzzleId={puzzle.id} version={boardVersion} />
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
      {revealing}
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
      {secondClues}
      onselect={selectFromClues}
    />
  </section>
</div>

<style>
  .bar-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
  }

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
