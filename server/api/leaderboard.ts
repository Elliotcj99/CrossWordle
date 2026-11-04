import { clientPuzzleFor, json } from '../../functions/api/_shared';
import type { Leaderboard } from '../leaderboard';
import type { Handler } from '../node-adapter';
import { playerIdFrom } from '../records';

/**
 * `GET /api/leaderboard?puzzle=<id>`: the top of the puzzle's board, its size, and where the
 * caller stands (from their `X-Player-Id`, which is optional here). See `../leaderboard.ts`.
 */
export function leaderboard(boards: Leaderboard): Handler {
  return ({ request }) => {
    const puzzleId = new URL(request.url).searchParams.get('puzzle') ?? '';
    if (clientPuzzleFor(puzzleId) === undefined) {
      return Promise.resolve(json({ error: 'unknown-puzzle' }, 404));
    }
    return Promise.resolve(json(boards.board(puzzleId, playerIdFrom(request))));
  };
}
