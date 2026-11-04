<script lang="ts">
  import { onDestroy } from 'svelte';
  import { sendFeedback } from '../lib/api';
  import { renderTurnstile, type Widget } from '../lib/turnstile';

  /**
   * "Request a feature": a title and a description, sent to the server for the admin to read.
   * Shown from the footer where the server offers it, with Cloudflare's bot check where the site
   * has a Turnstile key. The limits match the server's (server/feedback.ts).
   */
  let { siteKey }: { siteKey: string | undefined } = $props();

  const TITLE_MAX = 100;
  const DESCRIPTION_MAX = 2000;

  let title = $state('');
  let description = $state('');
  let token = $state<string | undefined>();
  let sending = $state(false);
  let message = $state('');
  let sent = $state(false);
  let checkEl = $state<HTMLElement>();
  let widget: Widget | undefined;

  $effect(() => {
    if (checkEl === undefined || siteKey === undefined || widget !== undefined) return;
    renderTurnstile(checkEl, siteKey, (t) => (token = t))
      .then((w) => (widget = w))
      .catch(() => (message = "The bot check couldn't load. Check your connection and reload."));
  });

  onDestroy(() => widget?.remove());

  const waitingForCheck = $derived(siteKey !== undefined && token === undefined);
  const length = (text: string) => [...text].length;

  async function send(event: SubmitEvent) {
    event.preventDefault();
    if (sending || waitingForCheck) return;
    sending = true;
    message = '';
    const outcome = await sendFeedback(title, description, token);
    sending = false;
    widget?.reset(); // Each check token works once.
    token = undefined;
    if (!outcome.ok) {
      message = outcome.message;
      return;
    }
    sent = true;
    title = '';
    description = '';
  }
</script>

{#if sent}
  <p class="status" role="status">
    Thanks, it's sent. We read every request.
    <button type="button" class="link" onclick={() => (sent = false)}>Send another</button>
  </p>
{:else}
  <form class="feedback" onsubmit={send} aria-labelledby="feedback-title">
    <h2 id="feedback-title">Request a feature</h2>
    <label for="feedback-summary">What would you like?</label>
    <input
      id="feedback-summary"
      type="text"
      bind:value={title}
      minlength="3"
      maxlength={TITLE_MAX}
      required
    />
    <label for="feedback-description">
      Tell us more <span class="count">{length(description)} / {DESCRIPTION_MAX}</span>
    </label>
    <textarea
      id="feedback-description"
      bind:value={description}
      minlength="10"
      maxlength={DESCRIPTION_MAX}
      rows="5"
      required></textarea>
    {#if siteKey !== undefined}
      <div class="check" bind:this={checkEl}></div>
    {/if}
    <div>
      <button type="submit" disabled={sending || waitingForCheck}>
        {sending ? 'Sending…' : 'Send'}
      </button>
    </div>
    <p class="status" role="status" aria-live="polite">{message}</p>
  </form>
{/if}

<style>
  .feedback {
    display: grid;
    gap: 6px;
    max-width: 34rem;
    margin-top: 12px;
    color: var(--ink);
    font-size: 0.9rem;
  }

  h2 {
    margin: 0 0 4px;
    font-size: 1rem;
  }

  label {
    font-weight: 700;
  }

  .count {
    margin-left: 8px;
    color: var(--ink-muted);
    font-weight: 400;
  }

  input,
  textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 9px 12px;
    border: 2px solid var(--rule);
    border-radius: 6px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  textarea {
    resize: vertical;
  }

  input:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--cursor);
    outline-offset: 1px;
  }

  button[type='submit'] {
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

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .check:empty {
    display: none;
  }

  .status {
    min-height: 1.4em;
    margin: 8px 0 0;
    color: var(--ink-muted);
  }
</style>
