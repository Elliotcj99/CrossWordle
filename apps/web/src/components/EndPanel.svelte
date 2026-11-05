<script lang="ts">
  import type { GameStatus, Stats } from '@crosswordle/engine';
  import NicknameForm from './NicknameForm.svelte';
  import StatsList from './StatsList.svelte';

  interface Props {
    puzzleId: string;
    status: Exclude<GameStatus, 'playing'>;
    stats: Stats;
    /** The spoiler-free result to share. */
    share: string;
    /** The player named themselves on the leaderboard. */
    onnamed?: () => void;
  }

  let { puzzleId, status, stats, share, onnamed }: Props = $props();

  let copyState = $state<'idle' | 'copied' | 'failed'>('idle');
  let shareText: HTMLPreElement | undefined = $state();

  async function copy() {
    try {
      await navigator.clipboard.writeText(share);
      copyState = 'copied';
    } catch {
      // Some browsers and embedded views refuse clipboard access: select the text instead.
      copyState = 'failed';
      if (shareText !== undefined) {
        const range = document.createRange();
        range.selectNodeContents(shareText);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
      }
    }
  }
</script>

<section class="end" class:won={status === 'won'} aria-labelledby="end-heading">
  <h2 id="end-heading">
    {status === 'won' ? 'Solved. Every entry cracked.' : 'Out of guesses.'}
  </h2>
  {#if status === 'lost'}
    <p class="note">The answers are shown in the grid.</p>
  {/if}

  <div class="stats">
    <StatsList {stats} />
  </div>

  <div class="share">
    <pre bind:this={shareText} aria-label="Result to share">{share}</pre>
    <button type="button" class="copy" onclick={copy}>Copy result</button>
    <p class="copy-status" role="status" aria-live="polite">
      {#if copyState === 'copied'}Copied. Paste it anywhere.{:else if copyState === 'failed'}Your
        browser blocked copying. The result is selected: copy it with Ctrl+C or a long press.{/if}
    </p>
  </div>

  {#if status === 'won'}
    <NicknameForm {puzzleId} onsaved={onnamed} />
  {/if}
</section>

<style>
  .end {
    margin: 0 0 20px;
    padding: 16px;
    border: 2px solid var(--absent);
    border-radius: 8px;
    background: var(--surface);
  }

  .end.won {
    border-color: var(--correct);
  }

  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.2rem;
  }

  .note {
    margin: 4px 0 0;
    color: var(--ink-muted);
  }

  .stats {
    margin: 16px 0;
  }

  .share {
    display: grid;
    gap: 8px;
    justify-items: start;
  }

  pre {
    margin: 0;
    max-width: 100%;
    overflow-x: auto;
    padding: 10px 12px;
    border-radius: 6px;
    background: var(--paper);
    font-size: 0.9rem;
    line-height: 1.35;
  }

  .copy {
    padding: 10px 18px;
    border: 0;
    border-radius: 6px;
    background: var(--ink);
    color: var(--paper);
    font-weight: 700;
    cursor: pointer;
  }

  .copy-status {
    min-height: 1.4em;
    margin: 0;
    color: var(--ink-muted);
  }
</style>
