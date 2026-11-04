# Testing a change without showing it to players

Two levels: a local full-stack run, and a staging site.

## 1. Local (fast loop, never public)

```sh
npm run preview
```

This builds the site, generates the answers bundle, and serves everything — static files **and** the
API — on the Node server that IIS runs (`server/preview.ts`), at <http://127.0.0.1:4173>. Use this
for day-to-day work; it is the only way to exercise `/api/guess` locally (plain `npm run dev` runs
Vite without the API). Its database and settings go in a `.data` folder (gitignored).

Quick check that scoring works and answers aren't served:

```sh
# scores a guess (never returns the answer)
curl -s -X POST http://127.0.0.1:4173/api/guess \
  -H 'content-type: application/json' \
  -d '{"puzzleId":"<id>","entryId":"1A","guess":"<word>"}'

# a public puzzle file: has "length", never "answer"
curl -s http://127.0.0.1:4173/puzzles/<id>.json
```

## 2. Staging site on IIS

A second IIS site beside the live one, on its own hostname, so a branch can be tried on the real
server without touching players. Setting it up (install, tunnel hostname, keeping it private with
Cloudflare Access) and deploying a branch to it are in
[deploy/iis/README.md](../deploy/iis/README.md).

## Optional: preview deployments on Cloudflare Pages

If the repo is also connected to Cloudflare Pages, Pages builds a **preview deployment** for every
non-production branch, at its own `https://<branch>.<project>.pages.dev` URL. Previews have no
database, so they show the game without the leaderboard, player records or feature requests. The
URL is unlisted but publicly reachable, so protect previews with Cloudflare Access:

1. Push the branch. **Its name must start with `feat/`** (e.g. `feat/naughty-hints`), or Pages
   builds no preview. The preview URL uses the branch name with `/` turned into `-`:
   `https://feat-naughty-hints.<project>.pages.dev`.
2. In the Cloudflare dashboard → the Pages project → **Settings → Builds → Branch control**:
   - **Production branch** is `main`.
   - **Preview branch** is **Custom branches**, with `feat/*` under **Include Preview branches**.
     The include box takes chips: type the pattern and press Enter, or Save stays disabled and
     nothing is stored. Custom branches keep Dependabot's branches from building previews.

   A branch pushed while previews were off is skipped. Push a new commit to build it.

3. In **Zero Trust → Access → Applications**, add a **Self-hosted** application covering the preview
   hostnames (e.g. `*.<project>.pages.dev`), with a policy that **allows only your and your
   reviewers' emails**. Previews now require an email login.
4. Open the preview URL, sign in, and test. Share the link only with people on the allowlist.
