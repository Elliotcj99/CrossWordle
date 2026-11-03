# Naughty word list

A hand-written list of rude, crude and profane English words, assembled for CrossWordle's
optional "Naughty mode". It is original to this project and placed in the public domain
(Creative Commons Zero, CC0 1.0): do what you like with it.

Scope: swearing and crude sexual or scatological vocabulary, plus milder rude words. It
**excludes slurs** — words that attack people for their race, ethnicity, religion, sexuality,
gender identity or disability. Those are not "cheeky", and they are kept out on purpose.

The aim is words that make people laugh at their rudeness, not ones that hurt. Insults aimed at
men and at women are both in, so the list doesn't pick on either.

`npm run check:naughty` enforces the slur rule, and runs before the naughty puzzles are
generated or published. It fails if a word or clue is one of the blocked words in
`blocked.sha256` (stored as SHA-256 hashes, so the slurs aren't in the repository as readable
text), a form of one, or a compound starting or ending with one. With `--wordnet <folder>` (an
unzipped Open English WordNet JSON release) it also flags words with a sense WordNet labels as a
slur. `reviewed.tsv` lists flagged words that were checked and kept, with the reason. It can clear
a compound or WordNet flag, never an exact blocked word.

In Naughty mode this list is merged with the ordinary guess dictionary (ENABLE and SCOWL; see
`../wordlists/NOTICE.md`), so ordinary words remain valid guesses too.
