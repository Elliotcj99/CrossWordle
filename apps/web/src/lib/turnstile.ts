/**
 * Cloudflare Turnstile, the bot check on forms. Cloudflare's script is loaded only when a form
 * that needs it appears (the site's CSP allows it, and its frames, from challenges.cloudflare.com).
 * The widget hands back a one-time token, which goes with the form; the server checks it.
 */

interface TurnstileApi {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
      theme?: 'auto' | 'light' | 'dark';
      size?: 'normal' | 'flexible' | 'compact';
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading: Promise<TurnstileApi> | undefined;

function load(): Promise<TurnstileApi> {
  loading ??= new Promise((resolve, reject) => {
    if (window.turnstile !== undefined) return resolve(window.turnstile);
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () =>
      window.turnstile === undefined
        ? reject(new Error('Turnstile did not load.'))
        : resolve(window.turnstile);
    script.onerror = () => {
      loading = undefined; // Let a later form try again.
      reject(new Error('Turnstile did not load.'));
    };
    document.head.append(script);
  });
  return loading;
}

/** A rendered widget: `reset` asks for a fresh token (each is single use), `remove` tidies up. */
export interface Widget {
  reset(): void;
  remove(): void;
}

/**
 * Shows the bot check in `element`. `onToken` gets each token as Cloudflare issues it, and
 * `undefined` when one expires or the check fails, so the form can wait for a fresh one.
 */
export async function renderTurnstile(
  element: HTMLElement,
  siteKey: string,
  onToken: (token: string | undefined) => void,
): Promise<Widget> {
  const api = await load();
  const id = api.render(element, {
    sitekey: siteKey,
    callback: onToken,
    'expired-callback': () => onToken(undefined),
    'error-callback': () => onToken(undefined),
    theme: 'auto',
    size: 'flexible',
  });
  return {
    reset: () => {
      onToken(undefined);
      api.reset(id);
    },
    remove: () => api.remove(id),
  };
}
