import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Where the server keeps its data and reads its settings. On IIS, web.config passes both as
 * environment variables, relative to the site folder (Node's working directory): the data folder
 * and config file sit in the site's root, beside the releases, so deploys never replace them.
 * Run by hand or by `npm run preview`, both default to a `.data` folder in the working directory.
 */
export interface Paths {
  /** Folder for the database. The app pool can write here, and nowhere else. */
  readonly data: string;
  /** The site's settings file. Optional: a missing file means no settings. */
  readonly config: string;
}

export function pathsFromEnv(env: NodeJS.ProcessEnv = process.env): Paths {
  const data = resolve(env.CROSSWORDLE_DATA ?? '.data');
  return { data, config: resolve(env.CROSSWORDLE_CONFIG ?? `${data}/config.json`) };
}

/**
 * The site's settings, from `config.json`. Kept out of the repo (it's public) and out of the
 * releases: the contact address and, later, the Turnstile keys.
 */
export interface Config {
  /** Shown by the Contact link. */
  readonly contactEmail?: string;
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

export function parseConfig(value: unknown, source = 'config'): Config {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${source} must be a JSON object.`);
  }
  const { contactEmail } = value as Record<string, unknown>;
  if (
    contactEmail !== undefined &&
    (typeof contactEmail !== 'string' || !contactEmail.includes('@'))
  ) {
    throw new Error(`${source}: contactEmail must be an email address.`);
  }
  return contactEmail === undefined ? {} : { contactEmail };
}
