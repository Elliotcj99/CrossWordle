import { json } from '../../functions/api/_shared';
import type { Config } from '../config';
import { tidyFeedback, type Feedback } from '../feedback';
import type { Handler } from '../node-adapter';
import { FEEDBACK_LIMIT, type RateLimits } from '../rate-limits';
import { playerIdFrom } from '../records';
import { clientAddress, jsonBody, passesBotCheck } from './forms';

/**
 * `POST /api/feedback` `{ title, description, turnstileToken? }`: a feature request, stored for
 * the admin (see `../feedback.ts`). 201 with its id; 400 `title-invalid` or
 * `description-invalid`; 429 `too-many`; 403 `check-failed`.
 */

export interface FeedbackServices {
  readonly feedback: Feedback;
  readonly limits: RateLimits;
  readonly config: Config;
}

export function feedback({ feedback: requests, limits, config }: FeedbackServices): Handler {
  return async ({ request }) => {
    const playerId = playerIdFrom(request);
    const body = await jsonBody<{ title: unknown; description: unknown; turnstileToken: unknown }>(
      request,
    );
    if (playerId === undefined || body === undefined) return json({ error: 'bad-request' }, 400);

    // Check the text before counting it, so a typo doesn't use up a try.
    const tidy = tidyFeedback(body.title, body.description);
    if ('problem' in tidy) return json({ error: `${tidy.problem}-invalid` }, 400);

    const ip = clientAddress(request);
    if (!limits.allow('feedback', playerId, ip, FEEDBACK_LIMIT)) {
      return json({ error: 'too-many' }, 429);
    }
    if (!(await passesBotCheck(config, body.turnstileToken, ip))) {
      return json({ error: 'check-failed' }, 403);
    }

    const id = requests.add(playerId, tidy.title, tidy.description);
    return json({ id }, 201);
  };
}
