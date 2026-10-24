# Clues

Daily puzzles take their answers and clues from `quick.tsv` and `edits.tsv`. Later lists
override earlier ones.

- `quick.tsv`: about 3,000 familiar words, each with a clue written for CrossWordle in the style of
  a British quick crossword (below). Edit it by hand.
- `edits.tsv`: hand edits. Replace a clue (`ANSWER<tab>Better clue`), add an answer, or take an
  answer out of the pool (`ANSWER<tab>-`).
- `wordnet.tsv`: reference only, not used for puzzles. About 15,900 common words with their main
  Open English WordNet definition, useful for checking a word's senses when writing clues and for
  choosing more answers. Don't edit it by hand; regenerate it (below).
- `NOTICE.md`: licences for the clue sources, published with the site's puzzle files.

## Clue style

Clues follow British quick crosswords such as the Guardian Quick and the Times Quick: plain
definitions a solver can get from general knowledge, never cryptic wordplay or crossword jargon.

- **Short.** One to four words where possible: "Desert" (ABANDON), "Fish basket", "Convent
  dweller". Never more than about eight.
- **Same part of speech, tense and number as the answer.** "Detests" for HATES, not HATE.
- **The familiar sense first.** ACE is "Serve that can't be returned", not "The number one".
- **Vary the type.** Mostly synonyms and short descriptions, with some fill-in-the-blanks
  ("Status ___"), two meanings joined by a dash ("Riverside – money lender" for BANK), and the
  odd playful clue with a question mark ("Wake-up call?" for ALARM).
- **British spelling and references.** "Pub counter", "Double-decker", "Fourteen pounds".
- **Fair.** No obscure senses, and nothing that gives the answer away: a clue may not contain the
  answer, its stem, or a word of four or more letters found inside it (`npm run generate` and the
  validator reject these).
- **Original.** Write new clues; never copy one from a newspaper.

Answers were chosen as the 3,000 pool words with the most WordNet senses, a good guide to how
familiar a word is. Puzzles still fill to 24 to 26 entries from that pool after excluding 60 days
of answers, and 3,000 answers last about 120 days before one has to repeat. To add answers, pick
familiar words from `wordnet.tsv` and clue them in `quick.tsv`.

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

## Regenerating `wordnet.tsv` (reference)

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
