# CrossWordle

A crossword where every entry is solved as its own Wordle.

## How to play

- Every Across and Down entry is a Wordle of its own length (3 to 10 letters). All clues are
  shown, so you can start anywhere.
- Each guess is scored per tile: **green** = right letter, right place; **yellow** = in this word
  but elsewhere; **grey** = not in this word, or no copies of it left. Answers and guesses may
  repeat letters.
- **Duplicate-count badge:** a green or yellow tile whose letter appears more than once in the
  answer shows how many times it appears. Grey tiles, and letters the answer has only once, show
  no number.
- **Crossings:** a green locks its cell. The letter appears in the crossing entry and is
  pre-filled in every guess there. Yellows and greys only apply within their own entry.
- **Guess budget:** one shared pool of 3 guesses per entry. Win by solving every entry before the
  pool runs out.

All of these rules are in `RuleSet` (`packages/engine/src/rules.ts`), and a puzzle file can
override them. For example, `"rules": {"guessBudget": {"kind": "perEntry", "extraGuesses": 1}}`
gives each entry its own limit of length + 1.

## Repository layout

| Path                 | What it is                                                                              |
| -------------------- | --------------------------------------------------------------------------------------- |
| `packages/engine`    | The rules: scoring, puzzle loading and validation, game state. Pure TypeScript, no UI.  |
| `packages/generator` | Command line: generate daily puzzles, build clue and word lists, validate, publish.     |
| `apps/web`           | The game: Svelte 5 + Vite, built to static files.                                       |
| `data/wordlists/`    | Guess dictionary sources (ENABLE, public domain, plus additions).                       |
| `data/clues/`        | Answers and clues for daily puzzles (Open English WordNet, CC BY 4.0, plus hand edits). |
| `puzzles/`           | Puzzle source files (plain answers), one per id.                                        |
| `deploy/`            | Security headers (one source for both hosts), nginx site, lab hosting guide.            |
| `scripts/`           | Header rendering and the lab deploy, both run locally.                                  |
| `.github/workflows`  | Cloudflare Pages deploy (`deploy-cloudflare.yml`), run by hand only. There is no CI.    |

## Getting started

Requires Node.js 22 LTS.

```sh
npm install
npm run dev          # publish puzzles, then start the dev server
npm test             # engine unit tests
npm run test:e2e     # browser tests (first time: npx playwright install chromium)
npm run lint
npm run typecheck
npm run build        # static site in apps/web/dist
```

There is no CI, so run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`
and `npm run test:e2e` before each commit.

## Puzzle files

```json
{
  "version": 1,
  "id": "2026-10-23",
  "title": "Thursday",
  "answerEncoding": "plain",
  "entries": [
    { "row": 0, "col": 0, "direction": "across", "answer": "LEVEL", "clue": "Flat and even" }
  ]
}
```

- The file name must be `<id>.json`. Daily puzzles use the date as the id. The site plays today's
  puzzle, or the latest one before today.
- Entry numbers (1A, 2D, ...) are worked out from the layout.
- `npm run validate-puzzles` checks the following: letters agree where entries cross, no stray
  words where entries touch, every entry connects to the rest, lengths are allowed and no
  answer repeats.
- `npm run puzzles` writes the site's copies to `apps/web/public/puzzles` with answers encoded.
  The encoding only stops answers being read at a glance; it is not security.

## Hosting

- **Now:** the private lab, deployed from your own machine with `npm run deploy:lab`. See
  [deploy/lab/README.md](deploy/lab/README.md).
- **Later:** Cloudflare Pages. Set the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
  secrets, then run the **Deploy to Cloudflare Pages** workflow.

## Known gaps

- Clues are adapted dictionary definitions, so some are flat or use an odd sense. Fix them in
  `data/clues/edits.tsv` (see `data/clues/README.md`).
