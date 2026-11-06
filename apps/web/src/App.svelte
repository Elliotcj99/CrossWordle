<script lang="ts">
  import HowToPlay from './components/HowToPlay.svelte';
  import RestorePrompt from './components/RestorePrompt.svelte';
  import SiteInfo from './components/SiteInfo.svelte';
  import StatsPanel from './components/StatsPanel.svelte';
  import YourRecord from './components/YourRecord.svelte';
  import Game from './Game.svelte';
  import { collectionOf, NAUGHTY, NORMAL } from './lib/collections';
  import { localDate } from './lib/dates';
  import { features } from './lib/features';
  import { loadPuzzleFor } from './lib/puzzles';
  import { applySettings, loadSettings, saveSettings } from './lib/settings';
  import { loadWordChecker } from './lib/words';

  let highContrast = $state(loadSettings().highContrast);
  $effect(() => {
    const settings = { highContrast };
    applySettings(settings);
    saveSettings(settings);
  });

  // Naughty mode is deliberately not remembered: it is off on every fresh load, and turning it on
  // always asks first, so nobody lands on strong language without opting in that session.
  let naughty = $state(false);
  let askingNaughty = $state(false);
  const collection = $derived(naughty ? NAUGHTY : NORMAL);

  /** The toggle button: switching on asks first; switching off is immediate. */
  function onNaughtyChange(wanted: boolean) {
    if (wanted && !naughty) askingNaughty = true;
    else naughty = wanted;
  }

  // How to play, Stats and Your record open below the header, across the page, one at a time.
  // Your record stays in the page while closed, so a code it's showing isn't lost, and is there
  // only where the server offers recovery codes or deleting a record.
  type Panel = 'help' | 'stats' | 'record';
  let openPanel = $state<Panel | undefined>();
  let hasRecord = $state(false);
  void features().then((host) => {
    hasRecord = host.names.has('recovery') || host.names.has('forget');
  });

  function toggle(panel: Panel) {
    openPanel = openPanel === panel ? undefined : panel;
  }

  /** `#2026-10-24` or `#sample` opens that puzzle; no hash opens today's. */
  const readHash = () => decodeURIComponent(location.hash.slice(1)) || undefined;

  let requested = $state(readHash());
  followHash();

  /**
   * Opens the puzzle in the address (a past puzzle from Stats, say) in its own collection: a
   * Naughty one asks first, as turning Naughty mode on always does; a daily one turns it off.
   */
  function followHash() {
    requested = readHash();
    if (requested === undefined) return;
    const wantsNaughty = collectionOf(requested) === NAUGHTY;
    if (wantsNaughty && !naughty) askingNaughty = true;
    else if (!wantsNaughty && naughty) naughty = false;
  }

  /** Back from a past puzzle to today's (or the latest), in the same collection. */
  function goToToday() {
    // A new history entry, so Back returns to the past puzzle. (pushState fires no hashchange.)
    history.pushState(null, '', location.pathname + location.search);
    followHash();
  }

  const loading = $derived(
    loadPuzzleFor(requested, collection).then(async (puzzle) => ({
      puzzle,
      // The word lists are only needed when the puzzle limits guesses to real words (the default).
      isWord: puzzle.rules.realWordsOnly
        ? await loadWordChecker(
            puzzle.entries.map((entry) => entry.length),
            collection.wordsPath,
          )
        : undefined,
    })),
  );
</script>

<svelte:window
  onhashchange={() => {
    followHash();
    if (openPanel === 'stats') openPanel = undefined;
  }}
/>

<main class:naughty>
  <header class="masthead">
    <h1
      class="wordmark"
      class:naughty
      aria-label={naughty ? 'CrossWordle, Naughty mode' : 'CrossWordle'}
    >
      <span class="cross" aria-hidden="true">
        <span>C</span><span>R</span><span>O</span><span>S</span><span>S</span>
      </span>
      <span class="wordle" aria-hidden="true">
        <span class="correct">W</span><span class="absent">O</span><span class="present">R</span
        ><span class="correct">D</span><span class="absent">L</span><span class="correct">E</span>
      </span>
      {#if naughty}
        <span class="stamp" aria-hidden="true">Naughty</span>
      {/if}
    </h1>
    <div class="tools">
      <button
        id="high-contrast"
        type="button"
        class="pill"
        aria-pressed={highContrast}
        onclick={() => (highContrast = !highContrast)}
      >
        High contrast
      </button>
      <button
        id="naughty-mode"
        type="button"
        class="pill naughty-toggle"
        aria-pressed={naughty}
        aria-label="Naughty mode"
        onclick={() => onNaughtyChange(!naughty)}
      >
        <span class="naughty-word" aria-hidden="true">Naughty</span>
      </button>
      <button
        id="help-toggle"
        type="button"
        class="toggle"
        aria-expanded={openPanel === 'help'}
        aria-controls="help-panel"
        onclick={() => toggle('help')}
        ><span class="arrow" aria-hidden="true">▸</span>How to play</button
      >
      <button
        id="stats-toggle"
        type="button"
        class="toggle"
        aria-expanded={openPanel === 'stats'}
        aria-controls="stats-panel"
        onclick={() => toggle('stats')}><span class="arrow" aria-hidden="true">▸</span>Stats</button
      >
      {#if hasRecord}
        <button
          id="record-toggle"
          type="button"
          class="toggle"
          aria-expanded={openPanel === 'record'}
          aria-controls="record-panel"
          onclick={() => toggle('record')}
          ><span class="arrow" aria-hidden="true">▸</span>Your record</button
        >
      {/if}
    </div>
  </header>

  {#if openPanel === 'help'}
    <section id="help-panel" class="header-panel" aria-labelledby="help-toggle">
      <HowToPlay />
    </section>
  {/if}
  {#if openPanel === 'stats'}
    <section id="stats-panel" class="header-panel" aria-labelledby="stats-toggle">
      <StatsPanel />
    </section>
  {/if}
  <section
    id="record-panel"
    class="header-panel"
    aria-labelledby="record-toggle"
    hidden={openPanel !== 'record'}
  >
    <YourRecord open={openPanel === 'record'} onopen={() => (openPanel = 'record')} />
  </section>

  <RestorePrompt />

  {#if askingNaughty}
    <div class="naughty-confirm" role="alertdialog" aria-labelledby="naughty-confirm-title">
      <p id="naughty-confirm-title">
        <strong>Naughty mode contains strong language and crude words.</strong> It's off again next time
        you open the page.
      </p>
      <div class="naughty-confirm-actions">
        <button
          type="button"
          class="link danger"
          onclick={() => {
            naughty = true;
            askingNaughty = false;
          }}>Let me in</button
        >
        <button type="button" class="link" onclick={() => (askingNaughty = false)}>No thanks</button
        >
      </div>
    </div>
  {/if}

  {#await loading}
    <p class="note">Loading today's puzzle…</p>
  {:then { puzzle, isWord }}
    {#if requested !== undefined && collection.dateOf(puzzle.id) !== localDate()}
      <p class="elsewhere">
        This isn't today's puzzle.
        <button type="button" class="link" onclick={goToToday}>Go to today's puzzle</button>
      </p>
    {/if}
    {#key puzzle.id}
      <Game {puzzle} {isWord} />
    {/key}
  {:catch error}
    <p class="note" role="alert">
      The puzzle didn't load: {error instanceof Error ? error.message : String(error)} Reload the page
      to try again.
    </p>
  {/await}

  <footer>
    <p>
      Clues written for CrossWordle, with answers chosen using
      <a href="https://en-word.net">Open English WordNet</a> (CC BY 4.0). Word lists from ENABLE and
      <a href="https://wordlist.aspell.net">SCOWL</a>. Licences:
      <a href="puzzles/NOTICE.md">clues</a>, <a href="words/NOTICE.md">word lists</a>.
    </p>
    <SiteInfo />
  </footer>
</main>

<style>
  main {
    max-width: 1080px;
    margin: 0 auto;
    padding-block: 20px 48px;
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
  }

  /* Wider where the game shows its clue list as a third column (Game.svelte). */
  @media (min-width: 1280px) {
    main {
      max-width: 1440px;
    }
  }

  .masthead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
    padding-bottom: 16px;
    margin-bottom: 20px;
    border-bottom: 2px solid var(--ink);
  }

  .wordmark {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(1rem, 3.4vw, 1.35rem);
    font-weight: 800;
    font-stretch: 125%;
    line-height: 1;
  }

  .cross,
  .wordle {
    display: flex;
    gap: 2px;
  }

  .cross {
    padding: 2px;
    background: var(--block);
  }

  .wordmark span span {
    display: grid;
    place-items: center;
    width: 1.6em;
    height: 1.6em;
  }

  .cross span {
    background: var(--surface);
    color: var(--ink);
  }

  .wordle span {
    border-radius: 3px;
    color: var(--on-mark);
  }

  .correct {
    background: var(--correct);
  }

  .present {
    background: var(--present);
  }

  .absent {
    background: var(--absent);
  }

  /* Naughty mode: a purple wordmark with a rubber-stamp slapped across it. */
  .wordmark.naughty .cross {
    background: #6a1fb0;
  }

  .wordmark.naughty .correct {
    background: #7b2cbf;
  }

  .wordmark.naughty .present {
    background: #9d4edd;
  }

  .wordmark.naughty .absent {
    background: #5a189a;
  }

  .stamp {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) rotate(-8deg);
    pointer-events: none;
    font-family: var(--font-display);
    font-weight: 800;
    font-stretch: 125%;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: clamp(0.85rem, 2.6vw, 1.1rem);
    color: #ff2e63;
    border: 2.5px solid #ff2e63;
    border-radius: 7px;
    padding: 2px 8px;
    background: color-mix(in srgb, #ff2e63 16%, transparent);
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.15);
  }

  .naughty-confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 20px;
    margin-bottom: 20px;
    padding: 12px 16px;
    border: 2px solid #9d4edd;
    border-radius: 8px;
    background: color-mix(in srgb, #9d4edd 12%, var(--surface));
  }

  .naughty-confirm p {
    margin: 0;
    max-width: 60ch;
  }

  .naughty-confirm-actions {
    display: flex;
    gap: 16px;
    white-space: nowrap;
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

  .note {
    color: var(--ink-muted);
  }

  .elsewhere {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    margin: 0 0 16px;
    padding: 10px 16px;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 8px;
  }

  .elsewhere .link {
    font: inherit;
    color: var(--ink);
    font-weight: 700;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 20px;
  }

  /* How to play, Stats and Your record: bold, with an arrow that turns down while its panel is open. */
  .toggle {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .arrow {
    display: inline-block;
    margin-right: 4px;
    transition: transform 0.15s;
  }

  .toggle[aria-expanded='true'] .arrow {
    transform: rotate(90deg);
  }

  .toggle:focus-visible {
    outline: 2px solid var(--cursor);
    outline-offset: 2px;
  }

  .header-panel {
    margin-bottom: 20px;
  }

  /* Settings are pill-shaped toggle buttons; aria-pressed carries state. Outlined when off,
     filled when on. Each variant sets the three colours. */
  .pill {
    --pill-edge: var(--ink-muted);
    --pill-ink: var(--ink);
    --pill-on: var(--ink);
    --pill-on-ink: var(--paper);
    position: relative;
    display: inline-flex;
    align-items: baseline;
    padding: 5px 16px 9px;
    border: 2px solid var(--pill-edge);
    border-radius: 999px;
    background: none;
    color: var(--pill-ink);
    font-family: var(--font-display);
    font-weight: 800;
    font-stretch: 125%;
    font-size: 0.95rem;
    line-height: 1.2;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .pill:hover {
    background: color-mix(in srgb, var(--pill-edge) 14%, transparent);
  }

  .pill:focus-visible {
    outline: 3px solid var(--cursor);
    outline-offset: 2px;
  }

  .pill[aria-pressed='true'] {
    background: var(--pill-on);
    border-color: var(--pill-on);
    color: var(--pill-on-ink);
  }

  /* Naughty mode: purple, with the word underlined. */
  .naughty-toggle {
    --pill-edge: #9d4edd;
    --pill-ink: #7b2cbf;
    --pill-on: #7b2cbf;
    --pill-on-ink: #fff;
  }

  .naughty-toggle[aria-pressed='true'] {
    box-shadow: 0 2px 10px color-mix(in srgb, #7b2cbf 45%, transparent);
  }

  .naughty-toggle .naughty-word {
    position: relative;
  }

  /* A continuous underline drawn below the descenders (text-decoration would
     break up around the "g" and "y"). Inherits the text colour. */
  .naughty-toggle .naughty-word::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -0.22em;
    height: 2.5px;
    border-radius: 2px;
    background: currentColor;
  }

  footer {
    margin-top: 40px;
    padding-top: 12px;
    border-top: 1px solid var(--rule);
    color: var(--ink-muted);
    font-size: 0.8rem;
  }

  footer a {
    color: inherit;
  }
</style>
