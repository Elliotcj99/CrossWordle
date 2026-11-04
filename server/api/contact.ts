import { json } from '../../functions/api/_shared';
import type { Config } from '../config';
import type { Handler } from '../node-adapter';

/**
 * `GET /api/contact`: the site's contact address, from its config (never the repo, which is
 * public). The page asks only when the player opens Contact, so the address isn't in the page for
 * harvesters to scrape. 404 where the site has none.
 */
export function contact(config: Config): Handler {
  // The config is fixed while the server runs, so the answer is too.
  const [body, status] =
    config.contactEmail === undefined
      ? [{ error: 'no-contact' }, 404]
      : [{ email: config.contactEmail }, 200];
  return () => Promise.resolve(json(body, status));
}
