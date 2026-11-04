<script lang="ts">
  import { onMount } from 'svelte';
  import { features } from '../lib/features';
  import {
    endRestorePrompt,
    onRestorePromptEnded,
    openRestoreForm,
    playerId,
    restorePromptWanted,
  } from '../lib/player';

  /**
   * A one-line offer, to a browser that has just been given a new player id, to bring back a
   * record with a recovery code. Such a browser may be new, or one whose data was cleared (Safari
   * clears a site's storage after 7 days without a visit), so it's worded for both. It goes for
   * good once the player closes it, restores a record or makes their first guess: games played
   * under the new id wouldn't count towards a restored record. Shown only where the server offers
   * recovery codes.
   */

  let show = $state(false);

  onMount(() => {
    // Makes this browser's id now if it has none, so a new one is noticed before anything else.
    playerId();
    const stop = onRestorePromptEnded(() => (show = false));
    void features().then((host) => {
      show = host.names.has('recovery') && restorePromptWanted();
    });
    return stop;
  });
</script>

{#if show}
  <aside class="restore-prompt" aria-label="Bring back your record">
    <p>
      Played here before? If you made a recovery code,
      <button type="button" class="link" onclick={openRestoreForm}>restore your record</button>.
    </p>
    <button type="button" class="close" aria-label="Close" onclick={endRestorePrompt}>✕</button>
  </aside>
{/if}

<style>
  .restore-prompt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: -8px 0 16px;
    padding: 4px 4px 4px 12px;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--surface);
    color: var(--ink-muted);
    font-size: 0.85rem;
  }

  p {
    margin: 0;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .close {
    flex: none;
    min-width: 32px;
    min-height: 32px;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--ink-muted);
    font: inherit;
    cursor: pointer;
  }

  .close:hover {
    background: color-mix(in srgb, var(--ink-muted) 14%, transparent);
  }

  .link:focus-visible,
  .close:focus-visible {
    outline: 2px solid var(--cursor);
    outline-offset: 2px;
  }
</style>
