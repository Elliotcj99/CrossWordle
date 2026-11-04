import { clientPuzzleFor, json } from '../../functions/api/_shared';
import { dateIn } from '../dates';
import type { Handler } from '../node-adapter';
import { playerIdFrom, type Records } from '../records';
import { jsonBody } from './forms';

/**
 * TEMPORARY, a one-off: remove this endpoint, its 'import-history' feature and the page's call by
 * Friday 6 November 2026. The imported history itself stays (`imported_results`, shown by
 * `/api/record`).
 *
 * `POST /api/import-history` `{ results: { [puzzleId]: { won, guesses } } }`: the puzzles this
 * browser finished before the server kept records (4 November 2026), copied once into the
 * player's history (`Records.importHistory`). Never ranked. Only released puzzles count, not the
 * sample. Replies with how many were copied.
 */
export function importHistory(records: Records, now: () => Date = () => new Date()): Handler {
  return async ({ request }) => {
    const playerId = playerIdFrom(request);
    const body = await jsonBody<{ results: unknown }>(request);
    const results = body?.results;
    if (playerId === undefined || typeof results !== 'object' || results === null) {
      return json({ error: 'bad-request' }, 400);
    }

    // The earliest time zone's date: the newest puzzle anyone can have played.
    const released = dateIn('Etc/GMT-14', now());
    const finished = Object.entries(results).flatMap(([puzzleId, result]) => {
      const date = /(\d{4}-\d{2}-\d{2})$/.exec(puzzleId)?.[1];
      if (date === undefined || date > released) return [];
      const puzzle = clientPuzzleFor(puzzleId);
      const { won, guesses } = (result ?? {}) as { won?: unknown; guesses?: unknown };
      if (puzzle === undefined || typeof won !== 'boolean' || typeof guesses !== 'number') {
        return [];
      }
      return [{ puzzle, won, guesses }];
    });
    return json({ imported: records.importHistory(playerId, finished) });
  };
}
