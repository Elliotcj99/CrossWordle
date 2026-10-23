<script lang="ts">
  // Static help text; no props.
</script>

<details>
  <summary>How to play</summary>
  <ul>
    <li>
      Every Across and Down entry is its own Wordle. Pick any clue to start. Guesses can be any
      letters; they don't have to be real words.
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
      Greens lock their square for good. Locked letters are already filled in on your next guess,
      and in the crossing entry too. Type the whole word or just the gaps.
    </li>
    <li>You share one pool of guesses across the whole puzzle. Spend it wisely.</li>
    <li>
      Prefer orange and blue? Turn on high-contrast colours. When you finish, copy your result to
      share it without giving the answers away.
    </li>
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
