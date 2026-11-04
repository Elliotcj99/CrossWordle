import { clientPuzzleFor, json } from '../../functions/api/_shared';
import type { Handler } from '../node-adapter';
import { playerIdFrom, type Records } from '../records';

/**
 * The player's own side of the server's record, for their browser (any browser that has their
 * player id, such as one restored with a recovery code):
 *
 * - `GET /api/record`: every puzzle they've finished, for their stats: the server's own results,
 *   and `imported`, the history copied from their browser from before the server kept records
 *   (won and guesses only).
 * - `GET /api/game?puzzle=<id>`: their current attempt at a puzzle, so a game started on one
 *   device carries on on another. 404 if they haven't played it.
 */

export function record(records: Records): Handler {
  return ({ request }) => {
    const playerId = playerIdFrom(request);
    if (playerId === undefined) return Promise.resolve(json({ error: 'bad-request' }, 400));
    const results = records.results(playerId).map((r) => ({
      puzzleId: r.puzzleId,
      won: r.won,
      guesses: r.guesses,
      crosswordHints: r.crosswordHints,
      wordleHints: r.wordleHints,
      ranked: r.ranked,
      unrankedReason: r.unrankedReason,
      finishedAt: r.finishedAt,
    }));
    return Promise.resolve(json({ results, imported: records.importedHistory(playerId) }));
  };
}

export function game(records: Records): Handler {
  return ({ request }) => {
    const playerId = playerIdFrom(request);
    if (playerId === undefined) return Promise.resolve(json({ error: 'bad-request' }, 400));
    const puzzle = clientPuzzleFor(new URL(request.url).searchParams.get('puzzle') ?? '');
    if (puzzle === undefined) return Promise.resolve(json({ error: 'unknown-puzzle' }, 404));
    const state = records.currentGame(playerId, puzzle);
    return Promise.resolve(
      state === undefined ? json({ error: 'no-game' }, 404) : json({ game: state }),
    );
  };
}
