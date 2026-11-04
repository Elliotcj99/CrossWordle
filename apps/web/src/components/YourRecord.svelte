<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { makeRecoveryCode, recoveryCodeStatus, restoreRecord } from '../lib/api';
  import { features } from '../lib/features';
  import { playerId, switchPlayer } from '../lib/player';
  import { renderTurnstile, type Widget } from '../lib/turnstile';

  /**
   * "Your record": a recovery code for the player's record on the server, so it can come back
   * after this browser's data is cleared, or move to another device. Shown only where the server
   * offers it. The code is shown once, with a form a password manager can save it from; the
   * restore form is one a password manager can fill.
   */

  const NICKNAME_KEY = 'crosswordle:nickname';
  // A fixed account name, so a password manager files the code under this site.
  const ACCOUNT = 'CrossWordle recovery code';

  let available = $state(false);
  let siteKey = $state<string | undefined>();
  let open = $state(false);

  let hasCode = $state<boolean | undefined>();
  let code = $state<string | undefined>();
  let making = $state(false);
  let offeredSave = $state(false);
  let copied = $state(false);
  let makeMessage = $state('');

  let entered = $state('');
  let showCode = $state(false);
  let token = $state<string | undefined>();
  let restoring = $state(false);
  let restoreMessage = $state('');
  let checkEl = $state<HTMLElement>();
  let widget: Widget | undefined;

  onMount(async () => {
    const host = await features();
    siteKey = host.turnstileSiteKey;
    available = host.names.has('recovery');
  });

  // Ask whether there's a code, and load the bot check, only once the panel is opened.
  $effect(() => {
    if (!open || hasCode !== undefined) return;
    void recoveryCodeStatus().then((status) => {
      if (status.ok) hasCode = status.hasCode;
    });
  });

  $effect(() => {
    if (!open || checkEl === undefined || siteKey === undefined || widget !== undefined) return;
    renderTurnstile(checkEl, siteKey, (t) => (token = t))
      .then((w) => (widget = w))
      .catch(
        () => (restoreMessage = "The bot check couldn't load. Check your connection and reload."),
      );
  });

  onDestroy(() => widget?.remove());

  async function make() {
    if (making) return;
    making = true;
    makeMessage = '';
    const outcome = await makeRecoveryCode();
    making = false;
    if (!outcome.ok) {
      makeMessage = outcome.message;
      return;
    }
    code = outcome.code;
    hasCode = true;
    offeredSave = false;
    copied = false;
  }

  async function copy() {
    if (code === undefined) return;
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch {
      makeMessage = 'Your browser blocked copying. Select the code and copy it by hand.';
    }
  }

  /** Submitting the form is what prompts a password manager to save the code; nothing is sent. */
  function offerSave(event: SubmitEvent) {
    event.preventDefault();
    offeredSave = true;
  }

  const waitingForCheck = $derived(siteKey !== undefined && token === undefined);

  async function restore(event: SubmitEvent) {
    event.preventDefault();
    if (restoring || waitingForCheck) return;
    restoring = true;
    restoreMessage = '';
    const outcome = await restoreRecord(entered, token);
    restoring = false;
    widget?.reset(); // Each check token works once.
    token = undefined;
    if (!outcome.ok) {
      restoreMessage = outcome.message;
      return;
    }
    if (outcome.playerId === playerId()) {
      restoreMessage = 'This browser already has that record.';
      return;
    }
    if (!switchPlayer(outcome.playerId)) {
      restoreMessage = "Your browser isn't letting this site save anything, so it can't switch.";
      return;
    }
    try {
      if (outcome.nickname === undefined) localStorage.removeItem(NICKNAME_KEY);
      else localStorage.setItem(NICKNAME_KEY, outcome.nickname);
    } catch {
      // Storage worked a moment ago; the nickname field just won't be filled in.
    }
    restoreMessage = 'Record restored. Reloading…';
    location.reload();
  }
</script>

{#if available}
  <details bind:open>
    <summary>Your record</summary>
    <div class="panel">
      <p>
        Your games are kept on our server under an anonymous id in this browser. A recovery code
        brings that record back if this browser's data is cleared, or onto another device.
      </p>

      <section aria-labelledby="make-code-title">
        <h2 id="make-code-title">Recovery code</h2>
        {#if code !== undefined}
          <p>Here's your code. It's shown only this once, so keep it somewhere safe.</p>
          <p class="code" aria-label="Your recovery code">{code}</p>
          <div class="row">
            <button type="button" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          {#if !offeredSave}
            <form class="row" onsubmit={offerSave} aria-label="Save the code in a password manager">
              <input
                class="hidden-field"
                type="text"
                name="username"
                autocomplete="username"
                value={ACCOUNT}
                readonly
                tabindex="-1"
                aria-hidden="true"
              />
              <input
                class="hidden-field"
                type="password"
                name="password"
                autocomplete="new-password"
                value={code}
                readonly
                tabindex="-1"
                aria-hidden="true"
              />
              <button type="submit">Save in my password manager</button>
            </form>
          {:else}
            <p class="status" role="status">
              If your browser offered to save it, choose Save. Copying it somewhere safe works too.
            </p>
          {/if}
        {:else}
          <p>
            {#if hasCode}
              You've made a code before. Making a new one replaces it, and the old one stops
              working.
            {:else}
              Make a code now, before you need it.
            {/if}
          </p>
          <div class="row">
            <button type="button" onclick={make} disabled={making || hasCode === undefined}>
              {making ? 'Making…' : hasCode ? 'Make a new code' : 'Make a recovery code'}
            </button>
          </div>
        {/if}
        <p class="status" role="status" aria-live="polite">{makeMessage}</p>
      </section>

      <section aria-labelledby="use-code-title">
        <h2 id="use-code-title">Use a recovery code</h2>
        <p>
          This browser switches to that record. Games played here under its current one stay on the
          server, but won't count towards it.
        </p>
        <form onsubmit={restore} aria-labelledby="use-code-title">
          <input
            class="hidden-field"
            type="text"
            name="username"
            autocomplete="username"
            value={ACCOUNT}
            readonly
            tabindex="-1"
            aria-hidden="true"
          />
          <label for="recovery-code">Recovery code</label>
          <div class="row">
            <input
              id="recovery-code"
              name="password"
              type={showCode ? 'text' : 'password'}
              autocomplete="current-password"
              spellcheck="false"
              bind:value={entered}
              required
            />
            <button type="submit" disabled={restoring || waitingForCheck}>
              {restoring ? 'Restoring…' : 'Restore'}
            </button>
          </div>
          <label class="show">
            <input type="checkbox" bind:checked={showCode} /> Show the code
          </label>
          {#if siteKey !== undefined}
            <div class="check" bind:this={checkEl}></div>
          {/if}
          <p class="status" role="status" aria-live="polite">{restoreMessage}</p>
        </form>
      </section>
    </div>
  </details>
{/if}

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

  .panel {
    display: grid;
    gap: 12px;
    padding: 12px 16px;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 8px;
  }

  p {
    margin: 0;
  }

  section {
    display: grid;
    gap: 8px;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  form {
    display: grid;
    gap: 8px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .code {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 1.1rem;
    letter-spacing: 0.04em;
    overflow-wrap: anywhere;
    user-select: all;
  }

  /* There for password managers, not people. Clipped rather than display:none, which managers
     skip. */
  .hidden-field {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  input:not([type='checkbox']):not(.hidden-field) {
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

  .show {
    color: var(--ink-muted);
    font-size: 0.9rem;
  }

  .check:empty {
    display: none;
  }

  .status {
    min-height: 1.4em;
    color: var(--ink-muted);
  }
</style>
