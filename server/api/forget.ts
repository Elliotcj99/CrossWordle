import { json } from '../../functions/api/_shared';
import type { Handler } from '../node-adapter';
import { playerIdFrom, type Records } from '../records';

/**
 * `POST /api/forget`: deletes everything the server keeps about the calling player (their games,
 * results, nickname, recovery code and form submissions). Only the player's own browser has its
 * id, so only they can ask. 204, whether or not there was anything to delete.
 */
export function forget(records: Records): Handler {
  return ({ request }) => {
    const playerId = playerIdFrom(request);
    if (playerId === undefined) return Promise.resolve(json({ error: 'bad-request' }, 400));
    records.forget(playerId);
    return Promise.resolve(new Response(null, { status: 204 }));
  };
}
