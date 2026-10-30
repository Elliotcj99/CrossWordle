# Testing a change without showing it to players

Two levels: a local full-stack run, and a private preview deployment.

## 1. Local (fast loop, never public)

```sh
npm run preview
```

This builds the site, generates the answers bundle, and serves everything — static files **and** the
scoring Function — with Wrangler at <http://127.0.0.1:8788>. Use this for day-to-day work; it is the
only way to exercise `/api/guess` locally (plain `npm run dev` runs Vite without the Function).

Quick check that scoring works and answers aren't served:

```sh
# scores a guess (never returns the answer)
curl -s -X POST http://127.0.0.1:8788/api/guess \
  -H 'content-type: application/json' \
  -d '{"puzzleId":"<id>","entryId":"1A","guess":"<word>"}'

# a public puzzle file: has "length", never "answer"
curl -s http://127.0.0.1:8788/puzzles/<id>.json
```

## 2. Private preview deployment (share with a reviewer, not players)

Cloudflare Pages builds a **preview deployment** for every non-production branch, at its own
`https://<branch>.<project>.pages.dev` URL. That URL is unlisted but publicly reachable, so protect
previews with Cloudflare Access:

1. Push the branch. Pages builds a preview (production stays on `main`).
2. In the Cloudflare dashboard → the Pages project → **Settings → General**, confirm the
   **production branch** is `main` (so only `main` goes live) and that preview deployments are
   enabled for other branches.
3. In **Zero Trust → Access → Applications**, add a **Self-hosted** application covering the preview
   hostnames (e.g. `*.<project>.pages.dev`), with a policy that **allows only your and your
   reviewers' emails**. Previews now require an email login; the production custom domain is
   unaffected.
4. Open the preview URL, sign in, and test. Share the link only with people on the allowlist.

Production deploy is unchanged: merge to `main`, push, and Pages builds and serves it at the custom
domain.
