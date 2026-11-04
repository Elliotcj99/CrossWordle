<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchContact } from '../lib/api';
  import { features } from '../lib/features';
  import FeedbackForm from './FeedbackForm.svelte';

  /**
   * The footer's Contact, Request a feature and Privacy links, where the server offers them (the
   * IIS site). The
   * contact address comes from the server only when asked for, so it isn't in the page for
   * address harvesters. The privacy note says what the site keeps, where and for how long:
   * keep it true whenever that changes.
   */
  let hasContact = $state(false);
  let hasRecords = $state(false);
  let hasFeedback = $state(false);
  let hasForget = $state(false);
  let siteKey = $state<string | undefined>();
  let showContact = $state(false);
  let showFeedback = $state(false);
  let showPrivacy = $state(false);
  let email = $state<string | undefined>();
  let contactFailed = $state(false);

  onMount(async () => {
    const host = await features();
    hasContact = host.names.has('contact');
    hasRecords = host.names.has('records');
    hasFeedback = host.names.has('feedback');
    hasForget = host.names.has('forget');
    siteKey = host.turnstileSiteKey;
  });

  async function openContact() {
    showContact = !showContact;
    if (!showContact || email !== undefined) return;
    contactFailed = false;
    email = await fetchContact();
    contactFailed = email === undefined;
  }
</script>

{#if hasContact || hasRecords || hasFeedback}
  <div class="links">
    {#if hasContact}
      <button type="button" class="link" aria-expanded={showContact} onclick={openContact}
        >Contact us</button
      >
    {/if}
    {#if hasFeedback}
      <button
        type="button"
        class="link"
        aria-expanded={showFeedback}
        onclick={() => (showFeedback = !showFeedback)}>Request a feature</button
      >
    {/if}
    {#if hasRecords}
      <button
        type="button"
        class="link"
        aria-expanded={showPrivacy}
        onclick={() => (showPrivacy = !showPrivacy)}>What we store</button
      >
    {/if}
  </div>

  <!-- Always in the page, so screen readers announce what appears in it. -->
  <p class="contact" role="status">
    {#if showContact}
      {#if email !== undefined}
        Questions, problems or ideas? Email <a href="mailto:{email}">{email}</a>.
      {:else if contactFailed}
        The address didn't load. Check your connection and try again.
      {:else}
        Loading…
      {/if}
    {/if}
  </p>

  {#if showFeedback}
    <FeedbackForm {siteKey} />
  {/if}

  {#if showPrivacy}
    <section class="privacy" aria-labelledby="privacy-title">
      <h2 id="privacy-title">What we store</h2>
      <p>
        No accounts, no cookies, no adverts and no tracking. To keep the game and the leaderboard
        working, we keep the following.
      </p>

      <h3>In your browser</h3>
      <p>
        Your games in progress, the puzzles you've finished, your settings, your nickname, and a
        random player id that keeps your games apart from everyone else's. Clearing this site's data
        removes them. When you save a new recovery code in a browser that needs the page to reload
        first (such as Safari), the code waits in that tab while it does, then is removed. The
        reload passes through our server, which doesn't read or keep the code.
      </p>

      <h3>On our server</h3>
      <ul>
        <li>
          <b>Your games:</b> under that random player id, every guess and clue you use, restarts, and
          how each puzzle ended. Kept until you delete your record.
        </li>
        <li>
          <b>Your nickname, if you give one.</b> It's shown on the leaderboard with your guesses, clues
          and finish time. Your player id never is.
        </li>
        <li>
          <b>Your recovery code, if you make one:</b> only a scrambled form of it (a hash), which can
          check a code but can't be turned back into one.
        </li>
        <li>
          <b>Your internet address</b>, with the time, when you submit a nickname, make a recovery
          code or use one. Only to stop abuse (limits on how often), and deleted after 30 days, even
          if you delete your record, so the limits can't be reset.
        </li>
        <li>
          <b>Error reports:</b> when something goes wrong on our side, what failed (which can include
          a little of what was sent) and, if it was your request, your player id. Deleted after 14 days.
        </li>
        <li>
          <b>A count of page loads per day</b>, with nothing about who: no id and no address.
        </li>
        <li>
          <b>Feature requests you send:</b> what you wrote, with your player id and the time, for us to
          read. Kept until you delete your record.
        </li>
      </ul>

      <h3>Cloudflare</h3>
      <p>
        The site is served through Cloudflare, which handles every request, as any host does, and
        runs the bot check on the forms (<a href="https://www.cloudflare.com/privacypolicy/"
          >Cloudflare's privacy policy</a
        >).
      </p>

      <h3>Deleting your record</h3>
      {#if hasForget}
        <p>
          Open <b>Your record</b> at the top of the page and choose <b>Delete my record</b>. Your
          games, results, nickname, recovery code and feature requests go from our server, and the
          game data from this browser (your display settings stay). We keep a scrambled form of the
          deleted id, so it can't be used again. If this browser switched records with a recovery
          code, delete each record from a browser using it.
          {#if hasContact}Anything else, use <b>Contact us</b>.{/if}
        </p>
      {:else if hasContact}
        <p>Use <b>Contact us</b> to ask for your record to be deleted.</p>
      {/if}
    </section>
  {/if}
{/if}

<style>
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin-top: 8px;
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

  .contact {
    margin: 8px 0 0;
  }

  .privacy {
    max-width: 40rem;
    margin-top: 12px;
    color: var(--ink);
    font-size: 0.9rem;
  }

  .privacy h2 {
    margin: 0 0 8px;
    font-size: 1rem;
  }

  .privacy h3 {
    margin: 12px 0 4px;
    font-size: 0.9rem;
  }

  .privacy p,
  .privacy ul {
    margin: 0;
  }

  .privacy ul {
    display: grid;
    gap: 4px;
    padding-left: 20px;
  }

  a {
    color: inherit;
  }
</style>
