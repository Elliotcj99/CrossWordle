import { loadPuzzle, parsePuzzleFile, type Puzzle } from '@crosswordle/engine';
import { localDate } from './dates';

interface IndexItem {
  readonly id: string;
  readonly title: string;
}

const DATED = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The puzzle named by `requested` (the page's `#id`) if it exists and isn't a future date;
 * otherwise today's puzzle, else the latest dated puzzle before today, else the first.
 */
export async function loadPuzzleFor(
  requested: string | undefined,
  today = localDate(new Date()),
): Promise<Puzzle> {
  const index = (await fetchJson('puzzles/index.json')) as IndexItem[];
  const playable = index.map((item) => item.id).filter((id) => !DATED.test(id) || id <= today);
  const latest = playable
    .filter((id) => DATED.test(id))
    .sort()
    .at(-1);
  const id =
    requested !== undefined && playable.includes(requested) ? requested : (latest ?? playable[0]);
  if (id === undefined) throw new Error('There are no puzzles to play.');
  return loadPuzzle(parsePuzzleFile(await fetchJson(`puzzles/${id}.json`)));
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
  return response.json();
}
