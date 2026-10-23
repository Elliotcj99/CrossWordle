<script lang="ts">
  import type { GameStatus, Stats } from '@crosswordle/engine';

  interface Props {
    status: Exclude<GameStatus, 'playing'>;
    stats: Stats;
    /** The spoiler-free result to share. */
    share: string;
  }

  let { status, stats, share }: Props = $props();

  let copyState = $state<'idle' | 'copied' | 'failed'>('idle');
  let shareText: HTMLPreElement | undefined = $state();

  const winRate = $derived(stats.played === 0 ? 0 : Math.round((stats.won / stats.played) * 100));

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

  <dl class="stats">
    <div>
      <dt>Played</dt>
      <dd>{stats.played}</dd>
    </div>
    <div>
      <dt>Won</dt>
      <dd>{winRate}%</dd>
    </div>
    <div>
      <dt>Streak</dt>
      <dd>{stats.currentStreak}</dd>
    </div>
    <div>
      <dt>Best</dt>
      <dd>{stats.bestStreak}</dd>
    </div>
  </dl>

  <div class="share">
    <pre bind:this={shareText} aria-label="Result to share">{share}</pre>
    <button type="button" class="copy" onclick={copy}>Copy result</button>
    <p class="copy-status" role="status" aria-live="polite">
      {#if copyState === 'copied'}Copied. Paste it anywhere.{:else if copyState === 'failed'}Your
        browser blocked copying. The result is selected: copy it with Ctrl+C or a long press.{/if}
    </p>
  </div>
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
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin: 16px 0;
  }

  .stats div {
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    text-align: center;
  }

  dt {
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  dd {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.6rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
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
