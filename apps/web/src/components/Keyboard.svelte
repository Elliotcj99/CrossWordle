<script lang="ts">
  import type { Mark } from '@crosswordle/engine';

  interface Props {
    /** Best mark so far for each letter, in the selected entry only. */
    marks: ReadonlyMap<string, Mark>;
    onkey: (key: string) => void;
  }

  let { marks, onkey }: Props = $props();

  const rows = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Enter', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Backspace'],
  ];
</script>

<div class="keyboard" aria-label="Keyboard">
  {#each rows as row, r (r)}
    <div class="row">
      {#each row as key (key)}
        <button
          type="button"
          class="key {marks.get(key) ?? ''}"
          class:wide={key.length > 1}
          aria-label={key === 'Backspace' ? 'Delete' : key}
          onclick={() => onkey(key)}
        >
          {key === 'Backspace' ? '⌫' : key}
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
  .keyboard {
    display: grid;
    gap: 6px;
    margin-top: 16px;
  }

  .row {
    display: flex;
    gap: 4px;
    justify-content: center;
  }

  .key {
    flex: 1;
    max-width: 44px;
    height: 52px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: var(--key);
    color: var(--ink);
    font-family: var(--font-display);
    font-weight: 700;
    cursor: pointer;
  }

  .key.wide {
    max-width: 68px;
    font-size: 0.75rem;
  }

  .key.correct {
    background: var(--correct);
    color: var(--on-mark);
  }

  .key.present {
    background: var(--present);
    color: var(--on-mark);
  }

  .key.absent {
    background: var(--absent);
    color: var(--on-mark);
  }
</style>
