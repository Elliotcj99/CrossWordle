<script lang="ts">
  import HowToPlay from './components/HowToPlay.svelte';
  import Game from './Game.svelte';
  import { loadPuzzleFor } from './lib/puzzles';
  import { applySettings, loadSettings, saveSettings } from './lib/settings';
  import { loadWordChecker } from './lib/words';

  let highContrast = $state(loadSettings().highContrast);
  $effect(() => {
    const settings = { highContrast };
    applySettings(settings);
    saveSettings(settings);
  });

  /** `#2026-10-24` or `#sample` opens that puzzle; no hash opens today's. */
  const readHash = () => decodeURIComponent(location.hash.slice(1)) || undefined;

  let requested = $state(readHash());
  const loading = $derived(
    loadPuzzleFor(requested).then(async (puzzle) => ({
      puzzle,
      isWord: await loadWordChecker(puzzle.entries.map((entry) => entry.answer.length)),
    })),
  );
</script>

<svelte:window onhashchange={() => (requested = readHash())} />

<main>
  <header class="masthead">
    <h1 class="wordmark" aria-label="CrossWordle">
      <span class="cross" aria-hidden="true">
        <span>C</span><span>R</span><span>O</span><span>S</span><span>S</span>
      </span>
      <span class="wordle" aria-hidden="true">
        <span class="correct">W</span><span class="absent">O</span><span class="present">R</span
        ><span class="correct">D</span><span class="absent">L</span><span class="correct">E</span>
      </span>
    </h1>
    <div class="tools">
      <label class="toggle">
        <input id="high-contrast" type="checkbox" bind:checked={highContrast} />
        High-contrast colours
      </label>
      <HowToPlay />
    </div>
  </header>

  {#await loading}
    <p class="note">Loading today's puzzle…</p>
  {:then { puzzle, isWord }}
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
      Clues adapted from <a href="https://en-word.net">Open English WordNet</a> (CC BY 4.0) and
      Princeton WordNet. Word lists from ENABLE and
      <a href="https://wordlist.aspell.net">SCOWL</a>. Licences:
      <a href="puzzles/NOTICE.md">clues</a>, <a href="words/NOTICE.md">word lists</a>.
    </p>
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

  .note {
    color: var(--ink-muted);
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px 20px;
  }

  .toggle {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .toggle input {
    width: 1.1rem;
    height: 1.1rem;
    accent-color: var(--ink);
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
