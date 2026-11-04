<script lang="ts">
  import { onMount } from 'svelte';
  import { features } from '../lib/features';

  // Help text; the last tip only where the server offers recovery codes.
  let recovery = $state(false);
  onMount(async () => {
    recovery = (await features()).names.has('recovery');
  });
</script>

<details>
  <summary>How to play</summary>
  <ul>
    <li>
      Every Across and Down entry is its own Wordle. Pick any clue to start. Each guess must be a
      real word.
    </li>
    <li>
      <b class="mark correct">Green</b> is the right letter in the right place.
      <b class="mark present">Yellow</b> is in this word but somewhere else.
      <b class="mark absent">Grey</b> is not in this word, or there are no more of it.
    </li>
    <li>
      A small number on a green or yellow tile means the answer has that letter more than once, and
      how many times.
    </li>
    <li>
      An entry is solved when you guess its word. Only then does it go on the grid in green, and the
      entries crossing it get its letters. Until then your greens stay in your own guesses. Type any
      word, even one that drops a green, to fish for other letters.
    </li>
    <li>You share one pool of guesses across the whole puzzle. Spend it wisely.</li>
    <li>
      Stuck on an entry? Reveal a second crossword clue, or a Wordle clue that shows one of its
      letters (marked <b>*</b>). Both are free and stay until you restart.
    </li>
    <li>
      Prefer orange and blue? Turn on high-contrast colours. When you finish, copy your result to
      share it without giving the answers away.
    </li>
    {#if recovery}
      <li>
        Your record is kept under an anonymous id in this browser. Open <b>Your record</b> to make a recovery
        code, so you can get it back if this browser forgets it, or use it on another device.
      </li>
    {/if}
  </ul>
</details>

<style>
  details {
    max-width: 34rem;
  }

  summary {
    cursor: pointer;
    font-weight: 700;
    text-align: right;
  }

  details[open] summary {
    margin-bottom: 8px;
  }

  ul {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 12px 16px 12px 32px;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 8px;
  }

  .mark {
    padding: 0 6px;
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
</style>
