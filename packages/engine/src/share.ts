import type { ClientPuzzle } from './client';
import { feedbackFor, gameStatus, guessCount, isSolved, type GameState } from './game';

/**
 * One square per guess, spoiler-free: green for the guess that solved the entry, yellow for a
 * guess that found at least one letter, black for a guess that found nothing.
 */
function squares(state: GameState, puzzle: ClientPuzzle, entryIndex: number): string {
  return feedbackFor(state, puzzle.entries[entryIndex]!)
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
export function shareText(puzzle: ClientPuzzle, state: GameState): string {
  const status = gameStatus(puzzle, state);
  const used = puzzle.entries.reduce((sum, e) => sum + guessCount(state, e), 0);
  const plural = used === 1 ? 'guess' : 'guesses';
  const headline =
    status === 'won'
      ? `Solved in ${used} ${plural}`
      : status === 'lost'
        ? `Out of guesses after ${used}`
        : `${used} ${plural} so far`;

  const lines = puzzle.entries.map((entry, i) => {
    const row = squares(state, puzzle, i);
    const mark = isSolved(state, entry) || status !== 'lost' ? row : `${row}❌`;
    return `${entry.id.padEnd(4)}${mark}`;
  });
  return [`CrossWordle · ${puzzle.title}`, headline, '', ...lines].join('\n');
}
