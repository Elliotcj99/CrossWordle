import { feedbackFor, gameStatus, guessesFor, isSolved, type GameState } from './game';
import type { Puzzle } from './puzzle';

/**
 * One square per guess, spoiler-free: green for the guess that solved the entry, yellow for a
 * guess that found at least one letter, black for a guess that found nothing.
 */
function squares(puzzle: Puzzle, state: GameState, entryIndex: number): string {
  return feedbackFor(puzzle, state, puzzle.entries[entryIndex]!)
    .map((row) =>
      row.every((l) => l.mark === 'correct')
        ? '🟩'
        : row.some((l) => l.mark !== 'absent')
          ? '🟨'
          : '⬛',
    )
    .join('');
}

/**
 * The text a player shares: the puzzle, the result, then a line per entry. An entry never solved
 * shows ❌ after its guesses.
 */
export function shareText(puzzle: Puzzle, state: GameState): string {
  const status = gameStatus(puzzle, state);
  const used = puzzle.entries.reduce((sum, e) => sum + guessesFor(state, e).length, 0);
  const plural = used === 1 ? 'guess' : 'guesses';
  const headline =
    status === 'won'
      ? `Solved in ${used} ${plural}`
      : status === 'lost'
        ? `Out of guesses after ${used}`
        : `${used} ${plural} so far`;

  const lines = puzzle.entries.map((entry, i) => {
    const row = squares(puzzle, state, i);
    const mark = isSolved(state, entry) || status !== 'lost' ? row : `${row}❌`;
    return `${entry.id.padEnd(4)}${mark}`;
  });
  return [`CrossWordle · ${puzzle.title}`, headline, '', ...lines].join('\n');
}
