import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Where the server keeps its data and logs and reads its settings. On IIS, web.config passes them
 * as environment variables, relative to the site folder (Node's working directory): the data and
 * logs folders and the config file sit in the site's root, beside the releases, so deploys never
 * replace them. Run by hand or by `npm run preview`, all default to a `.data` folder in the
 * working directory.
 */
export interface Paths {
  /** Folder for the database. The app pool can write here, and nowhere else. */
  readonly data: string;
  /** The site's settings file. Optional: a missing file means no settings. */
  readonly config: string;
  /** Folder for the error log (see log.ts). The app pool can write here too. */
  readonly logs: string;
}

export function pathsFromEnv(env: NodeJS.ProcessEnv = process.env): Paths {
  const data = resolve(env.CROSSWORDLE_DATA ?? '.data');
  return {
    data,
    config: resolve(env.CROSSWORDLE_CONFIG ?? `${data}/config.json`),
    logs: resolve(env.CROSSWORDLE_LOGS ?? `${data}/logs`),
  };
}

/** The database file, in the data folder. */
export function databaseFile(paths: Paths): string {
  return join(paths.data, 'crosswordle.db');
}

/**
 * The site's settings, from `config.json`. Kept out of the repo (it's public) and out of the
 * releases: the contact address and, later, the Turnstile keys.
 */
export interface Config {
  /** Shown by the Contact link. */
  readonly contactEmail?: string;
  /**
   * Cloudflare Turnstile keys for the bot check on forms. Without them the forms work unchecked,
   * which is only for local runs: every IIS site sets them (test keys on staging).
   */
  readonly turnstile?: { readonly siteKey: string; readonly secretKey: string };
}

/** Reads the settings file; a missing file is no settings, a malformed one is an error. */
export function readConfig(path: string): Config {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
  return parseConfig(JSON.parse(text.replace(/^\uFEFF/, '')) as unknown, path);
}

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

export function parseConfig(value: unknown, source = 'config'): Config {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${source} must be a JSON object.`);
  }
  const { contactEmail, turnstile } = value as Record<string, unknown>;
  if (contactEmail !== undefined && (!isText(contactEmail) || !contactEmail.includes('@'))) {
    throw new Error(`${source}: contactEmail must be an email address.`);
  }
  if (turnstile !== undefined) {
    const keys = turnstile as Record<string, unknown> | null;
    if (
      typeof keys !== 'object' ||
      keys === null ||
      !isText(keys.siteKey) ||
      !isText(keys.secretKey)
    ) {
      throw new Error(`${source}: turnstile needs a siteKey and a secretKey.`);
    }
  }
  const keys = turnstile as { siteKey: string; secretKey: string } | undefined;
  return {
    ...(contactEmail === undefined ? {} : { contactEmail: contactEmail as string }),
    ...(keys === undefined
      ? {}
      : { turnstile: { siteKey: keys.siteKey, secretKey: keys.secretKey } }),
  };
}
