import { loadClientPuzzle, parsePublicPuzzleFile, type ClientPuzzle } from '@crosswordle/engine';
import { NORMAL, type Collection } from './collections';
import { localDate } from './dates';

interface IndexItem {
  readonly id: string;
  readonly title: string;
}

/**
 * The puzzle named by `requested` (the page's `#id`) if it exists in `collection` and isn't a
 * future date; otherwise today's puzzle, else the latest dated puzzle before today, else the
 * first. A puzzle's play date comes from `collection.dateOf`, so prefixed collections (Naughty
 * mode) still hide future puzzles.
 */
export async function loadPuzzleFor(
  requested: string | undefined,
  collection: Collection = NORMAL,
  today = localDate(new Date()),
): Promise<ClientPuzzle> {
  const index = (await fetchJson(collection.indexPath)) as IndexItem[];
  const dateOf = collection.dateOf;
  const playable = index.map((item) => item.id).filter((id) => (dateOf(id) ?? '') <= today);
  const latest = playable
    .filter((id) => dateOf(id) !== undefined)
    .sort()
    .at(-1);
  const id =
    requested !== undefined && playable.includes(requested) ? requested : (latest ?? playable[0]);
  if (id === undefined) throw new Error('There are no puzzles to play.');
  return loadClientPuzzle(parsePublicPuzzleFile(await fetchJson(collection.puzzlePath(id))));
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
  return response.json();
}
