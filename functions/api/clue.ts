import { json, readEntryRequest } from './_shared';

/**
 * Reveals an entry's second clue (the "Crossword clue" hint). The published puzzle only says
 * whether an entry has one, so the page asks here, and a server that keeps records knows the
 * player has seen it. Returns `{ clue }`, 404 for an unknown puzzle or entry, or 409 when the
 * entry has no second clue.
 */

export const onRequestPost = async (context: { request: Request }): Promise<Response> => {
  const found = await readEntryRequest(context.request);
  if (found instanceof Response) return found;
  const { entry } = found;
  if (entry.clue2 === undefined) return json({ error: 'no-second-clue' }, 409);

  return json({ clue: entry.clue2 });
};
