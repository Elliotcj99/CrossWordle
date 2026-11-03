import { onRequestPost as guess } from '../functions/api/guess';
import { onRequestPost as hint } from '../functions/api/hint';
import { features } from './api/features';
import type { Routes } from './node-adapter';

/**
 * Every API route, for both the IIS server (`main.ts`) and the local preview (`preview.ts`), so
 * they can't drift apart. Guess and hint are the Pages Function handlers; the rest are Node-only.
 */
export function apiRoutes(): Routes {
  return {
    '/api/guess': { POST: guess },
    '/api/hint': { POST: hint },
    '/api/features': { GET: features },
  };
}
