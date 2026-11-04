<script lang="ts">
  import { onMount } from 'svelte';
  import { submitNickname, type RecordedResult } from '../lib/api';
  import { features } from '../lib/features';
  import { rememberedNickname, rememberNickname } from '../lib/nickname';
  import TurnstileCheck from './TurnstileCheck.svelte';

  /**
   * Names the player on the leaderboard after they solve a puzzle. Shown only where the server
   * keeps records (IIS), with Cloudflare's bot check when the site has a Turnstile key. The score
   * comes from the server's own record of the game, so the form only sends the name.
   */
  let { puzzleId, onsaved }: { puzzleId: string; onsaved?: (() => void) | undefined } = $props();

  let available = $state(false);
  let siteKey = $state<string | undefined>();
  let nickname = $state(rememberedNickname());
  let token = $state<string | undefined>();
  let check = $state<TurnstileCheck>();
  let submitting = $state(false);
  let message = $state('');
  let saved = $state<{ nickname: string; result: RecordedResult } | undefined>();

  onMount(async () => {
    const host = await features();
    siteKey = host.turnstileSiteKey;
    available = host.names.has('nicknames');
  });

  const waitingForCheck = $derived(siteKey !== undefined && token === undefined);

  function count(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (submitting || waitingForCheck) return;
    submitting = true;
    message = '';
    const outcome = await submitNickname(puzzleId, nickname, token);
    submitting = false;
    check?.reset(); // Each check token works once.
    if (!outcome.ok) {
      message = outcome.message;
      return;
    }
    saved = { nickname: outcome.nickname, result: outcome.result };
    nickname = outcome.nickname;
    onsaved?.();
    rememberNickname(outcome.nickname);
  }
</script>

{#if available}
  <form class="nickname" onsubmit={submit} aria-labelledby="nickname-label">
    <label id="nickname-label" for="nickname">Your nickname for the leaderboard</label>
    <div class="row">
      <input
        id="nickname"
        name="nickname"
        type="text"
        bind:value={nickname}
        minlength="2"
        maxlength="20"
        autocomplete="nickname"
        spellcheck="false"
        required
      />
      <button type="submit" disabled={submitting || waitingForCheck}>
        {submitting ? 'Saving…' : saved === undefined ? 'Submit' : 'Update'}
      </button>
    </div>
    {#if siteKey !== undefined}
      <TurnstileCheck
        {siteKey}
        ontoken={(t) => (token = t)}
        bind:this={check}
        onerror={(m) => (message = m)}
      />
    {/if}
    <p class="status" role="status" aria-live="polite">
      {#if message !== ''}
        {message}
      {:else if saved !== undefined}
        {#if saved.result.ranked}
          Saved as {saved.nickname}. You're on the leaderboard with {count(
            saved.result.guesses,
            'guess',
            'guesses',
          )}, {count(saved.result.crosswordHints, 'Crossword clue')} and
          {count(saved.result.wordleHints, 'Wordle clue')}.
        {:else if saved.result.unrankedReason === 'restarted'}
          Saved as {saved.nickname}. This game isn't on the leaderboard because you restarted it,
          but it's kept in your own record.
        {:else}
          Saved as {saved.nickname}. Only wins on a first attempt go on the leaderboard; this game
          is kept in your own record.
        {/if}
      {/if}
    </p>
  </form>
{/if}

<style>
  .nickname {
    display: grid;
    gap: 8px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--rule);
  }

  label {
    font-weight: 700;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  input {
    flex: 1 1 12em;
    min-width: 0;
    padding: 9px 12px;
    border: 2px solid var(--rule);
    border-radius: 6px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  input:focus-visible {
    outline: 2px solid var(--cursor);
    outline-offset: 1px;
  }

  button {
    padding: 10px 18px;
    border: 0;
    border-radius: 6px;
    background: var(--ink);
    color: var(--paper);
    font-weight: 700;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .status {
    min-height: 1.4em;
    margin: 0;
    color: var(--ink-muted);
  }
</style>
