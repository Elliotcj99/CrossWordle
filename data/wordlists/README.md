# Word lists

Every `.txt` file in this folder is merged into the guess dictionary: one word per line, letters
only, any case. Blank lines and lines starting with `#` are ignored. `NOTICE.md` holds the
sources' licences and is published with the site's word files, so keep it up to date when a
source is added.

- `enable1.txt`: ENABLE (Enhanced North American Benchmark Lexicon), public domain, 172,823 words.
- `scowl-gb-70.txt`: SCOWL / English Speller Database, British English, size 70 ("large"),
  131,235 words. Adds about 9,200 words of 3 to 10 letters that ENABLE lacks, mostly newer words
  and British usage (EMAIL, PODCAST, SELFIE, BHAJI, CROSTINI). ENABLE already has most British
  spellings (COLOUR, REALISE).
  Free to redistribute provided its copyright notice goes with every copy; the notice is at the
  top of the file and in `NOTICE.md`.
- `additions.txt`: words neither list has that should be accepted.

## Where they came from

- `enable1.txt`: downloaded from [dolph/dictionary](https://github.com/dolph/dictionary) on
  2026-10-23 (SHA-256 `3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89` before
  line endings were normalised).
- `scowl-gb-70.txt`: generated on 2026-10-23 (SHA-256
  `3f62bc9763c7fa89a39f88fa8fcd3ec9a7e0c074f55cd8c19f98da3549a377b4` as downloaded) from
  `https://app.aspell.net/create?max_size=70&spelling=GBs&spelling=GBz&max_variant=1&diacritic=strip&special=hacker&download=wordlist&encoding=utf-8&format=inline`,
  then filtered to lowercase letters-only entries (dropping names, abbreviations and possessives),
  with the generator's header and licence kept as `#` comments.

## What they're used for

- **Guesses:** must be in the lists, unless a puzzle turns the `realWordsOnly` rule off.
  `npm run words` writes one file per allowed length to `apps/web/public/words/`, plus
  `NOTICE.md`. The site loads only the lengths the day's puzzle uses.
- **Answers:** `npm run validate-puzzles` rejects a puzzle whose answers aren't in the lists.
