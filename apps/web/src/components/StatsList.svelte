<script lang="ts">
  import type { Stats } from '@crosswordle/engine';

  /** The player's stats as four figures: played, won, current streak and best streak. */
  let { stats }: { stats: Stats } = $props();

  const winRate = $derived(stats.played === 0 ? 0 : Math.round((stats.won / stats.played) * 100));
</script>

<dl>
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

<style>
  dl {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
  }

  div {
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
</style>
