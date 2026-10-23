# Clues

Daily puzzles take their answers and clues from these lists. Later lists override earlier ones.

- `wordnet.tsv`: generated, about 15,600 common words, each with a clue adapted from its main
  Open English WordNet definition. Don't edit it by hand; regenerate it (below).
- `edits.tsv`: hand edits. Replace a weak clue (`ANSWER<tab>Better clue`), add an answer, or
  take an answer out of the pool (`ANSWER<tab>-`).
- `NOTICE.md`: licences for the clue sources, published with the site's puzzle files.

Each line is `ANSWER<tab>clue`. Blank lines and lines starting with `#` are ignored. Answers must
be in the guess dictionary (`data/wordlists`), and a clue may not contain its answer.

## Making puzzles

```sh
npm run generate                      # the next 14 days from today, skipping existing ones
npm run generate -- --from 2026-11-01 --days 30
```

Puzzles are written to `puzzles/<date>.json` with plain answers, so they can be reviewed (and
hand-edited) before publishing. An answer isn't reused within 60 days. The same date always
produces the same puzzle from the same lists.

## Regenerating `wordnet.tsv`

1. Download and unzip `english-wordnet-2025-json.zip` from the
   [Open English WordNet 2025 release](https://github.com/globalwordnet/english-wordnet/releases/tag/2025-edition)
   (SHA-256 `7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51`).
2. Download the common-word list from SCOWL, size 35 ("small"), British English:
   `https://app.aspell.net/create?max_size=35&spelling=GBs&spelling=GBz&max_variant=1&diacritic=strip&special=hacker&download=wordlist&encoding=utf-8&format=inline`
   (the 2026-10-23 download had SHA-256
   `2a0776e55e97377b62e7a55d77f992162588e4802fbafbfa05caf67770748ff4`).
3. Run:
   ```sh
   npx tsx packages/generator/src/cli.ts clues --wordnet <unzipped json folder> \
     --answers <scowl list> --words data/wordlists --out data/clues/wordnet.tsv
   ```

For each common word the generator takes the first definition in the word's main part of speech
that is at most 90 characters and doesn't contain the answer. It keeps only the first clause,
drops bracketed asides, and capitalises the first letter.

Rude, vulgar and sexual words are included: they're real words. Senses WordNet labels as slurs
("(ethnic slur)", "offensive term for ...") are never used as clues; a word with a slur sense
keeps a clue from its other senses (BOY, QUEEN). Answers mainly known today as slurs are
excluded by hand in `edits.tsv`, and stay valid guesses.
