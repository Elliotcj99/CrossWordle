# CLAUDE.md

- The engine (`packages/engine`) is the single source of truth for rules. The web app and the
  generator never re-implement scoring, locks or budgets.
- Game state is only the guesses. Derive feedback, locks, budgets and status from it; don't store them.
- New rules go in `RuleSet` with a default, and puzzle files can override them. Don't hard-code
  rules in the UI.
- Every engine change gets unit tests in `packages/engine/test`.
- Never commit real host names, IP addresses, domains or account names. Use `example.com`,
  `192.0.2.x` and repository variables or secrets instead.
