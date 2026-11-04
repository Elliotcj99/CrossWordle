<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { renderTurnstile, type Widget } from '../lib/turnstile';

  /**
   * Cloudflare's bot check for a form: one widget for as long as this is on the page, removed when
   * it goes, even if it goes before Cloudflare's script has finished loading. `ontoken` gets each
   * one-time token, and undefined when it expires or is used; call `reset()` after each submit,
   * as a token works once. Shared by every form, so they all handle the widget the same way.
   */
  let {
    siteKey,
    ontoken,
    onerror,
  }: {
    siteKey: string;
    ontoken: (token: string | undefined) => void;
    onerror?: (message: string) => void;
  } = $props();

  let element = $state<HTMLElement>();
  let widget: Widget | undefined;
  let gone = false;

  onMount(() => {
    renderTurnstile(element!, siteKey, (next) => {
      if (!gone) ontoken(next);
    })
      .then((rendered) => {
        if (gone) rendered.remove();
        else widget = rendered;
      })
      .catch(() => {
        if (!gone) onerror?.("The bot check couldn't load. Check your connection and reload.");
      });
  });

  onDestroy(() => {
    gone = true;
    widget?.remove();
  });

  /** Asks Cloudflare for a fresh token. */
  export function reset(): void {
    ontoken(undefined);
    widget?.reset();
  }
</script>

<div class="check" bind:this={element}></div>

<style>
  .check:empty {
    display: none;
  }
</style>
