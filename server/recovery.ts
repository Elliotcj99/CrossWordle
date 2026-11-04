import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Recovery codes: a way back to a player's record after the browser's data is cleared, or onto
 * another device. A code is 100 random bits, shown to the player once; the server keeps only its
 * SHA-256 hash (a fast hash is enough for a random secret this long, unlike a chosen password).
 * Entering the code in any browser switches it to that player id. Making a new code replaces the
 * old one, which then stops working.
 *
 * Codes are written in Crockford's base 32 (no I, L, O or U), in four groups of five, and read
 * forgivingly: any case, spaces or dashes, O for 0 and I or L for 1.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 20; // 20 characters x 5 bits = 100 bits

/** A new code, formatted for showing: `ABCDE-FGHJK-MNPQR-STVWX`. */
export function generateCode(): string {
  const bytes = randomBytes(LENGTH);
  // 256 is a multiple of 32, so taking each byte mod 32 is unbiased.
  const chars = [...bytes].map((b) => ALPHABET[b % 32]!).join('');
  return chars.match(/.{5}/g)!.join('-');
}

/** The code's canonical form, or `undefined` if it can't be a code. */
export function normaliseCode(input: string): string | undefined {
  const code = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return code.length === LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : undefined;
}

function hashOf(normalised: string): string {
  return createHash('sha256').update(normalised).digest('hex');
}

export interface RestoredPlayer {
  readonly playerId: string;
  readonly nickname?: string;
}

export class Recovery {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Makes a new code for a player (registering them if they're new), replacing any old one. */
  create(playerId: string): string {
    const code = generateCode();
    const at = this.now().toISOString();
    this.db
      .prepare('INSERT OR IGNORE INTO players (id, created_at) VALUES (?, ?)')
      .run(playerId, at);
    this.db
      .prepare('UPDATE players SET recovery_hash = ?, recovery_at = ? WHERE id = ?')
      .run(hashOf(normaliseCode(code)!), at, playerId);
    return code;
  }

  /** Whether a player has a recovery code. */
  hasCode(playerId: string): boolean {
    const row = this.db
      .prepare('SELECT recovery_hash IS NOT NULL AS has FROM players WHERE id = ?')
      .get(playerId) as { has: number } | undefined;
    return row?.has === 1;
  }

  /** The player a code belongs to, or `undefined` for an unknown (or replaced) code. */
  restore(code: string): RestoredPlayer | undefined {
    const normalised = normaliseCode(code);
    if (normalised === undefined) return undefined;
    const row = this.db
      .prepare('SELECT id, nickname FROM players WHERE recovery_hash = ?')
      .get(hashOf(normalised)) as { id: string; nickname: string | null } | undefined;
    if (row === undefined) return undefined;
    return row.nickname === null
      ? { playerId: row.id }
      : { playerId: row.id, nickname: row.nickname };
  }
}
