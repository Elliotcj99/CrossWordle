import { json } from '../../functions/api/_shared';
import type { Config } from '../config';
import type { Handler } from '../node-adapter';

/**
 * `GET /api/contact`: the site's contact address, from its config (never the repo, which is
 * public). The page asks only when the player opens Contact, so the address isn't in the page for
 * harvesters to scrape. 404 where the site has none.
 */
export function contact(config: Config): Handler {
  return () =>
    Promise.resolve(
      config.contactEmail === undefined
        ? json({ error: 'no-contact' }, 404)
        : json({ email: config.contactEmail }),
    );
}
