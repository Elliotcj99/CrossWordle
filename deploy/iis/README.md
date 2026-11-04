# Hosting on IIS

The same site and API as on Cloudflare Pages, served from a Windows Server by IIS, with the public
name proxied by Cloudflare.

By default the install script binds the site to plain HTTP on loopback (`http://127.0.0.1:8080/`,
staging `8081`), for a **Cloudflare Tunnel**: cloudflared runs on the server and connects out to
Cloudflare, so nothing needs opening on the network and no certificate is needed on the server.
See [Cloudflare Tunnel](#cloudflare-tunnel). To serve the site another way, pass your own binding
to the install script (see [Your own binding](#your-own-binding)).

Pages keeps working as it does now, so either host can serve the public name, and switching between
them is a DNS change (see [Switching hosts](#switching-hosts)).

```
Browser ─HTTPS─▶ Cloudflare edge (crosswordle.example.com, proxied)
                     │  tunnel
                     ▼
            cloudflared on the server ──http://127.0.0.1:8080──▶ IIS site "crosswordle"
                                                                  ├─ static files: releases\<sha>\site
                                                                  └─ /api/*: Node, via HttpPlatformHandler
                                                                             (releases\<sha>\server\server.mjs)
```

- **The API is the same code as on Pages.** `server/main.ts` runs the Pages Function handlers
  (`functions/api/*`) on a plain Node HTTP server, through a small adapter
  (`server/node-adapter.ts`). Scoring still lives in the engine.
- **The answers stay off the web.** `npm run build:iis` bundles the API, with the answers inlined,
  into `dist/iis/server/server.mjs`. That folder sits next to the site folder, not inside it, so IIS
  can never serve it.
- **The headers match Pages.** `web.config` is rendered from `deploy/iis/web.config` and
  `deploy/security-headers.json` by `scripts/render-headers.mjs --format iis`, so the CSP and cache
  rules are the same on every host.
- **The public path is always Cloudflare first.** With the default binding, IIS is on loopback and
  only cloudflared reaches it. The script leaves the server's firewall alone: with your own
  binding, the network decides which machines can reach IIS's port.
- The app uses `#` URLs (`#2026-10-24`), so no rewrite rules are needed for routing. URL Rewrite
  has one job: answering folder URLs (`/assets/`) with a 404 instead of IIS's empty 200. (Pages
  answers them with the home page.)

## One-time server setup

On the server, as an administrator:

1. Install, from their signed installers (check each one's signature, and Node's SHA-256 against
   `SHASUMS256.txt`):
   - **Node.js 22 LTS** (Windows x64 MSI, machine-wide, default path `C:\Program Files\nodejs`).
   - **HttpPlatformHandler v1.2** and **URL Rewrite 2.1** (x64 MSIs from Microsoft's IIS
     downloads, signed by Microsoft). They register themselves with IIS, so install them **after**
     IIS: run step 2 once first (it installs IIS, then stops and says what's missing), install
     these, then run step 2 again.

   Installing IIS also creates the **Default Web Site** on port 80, for every address. If nothing
   else uses it, stop it and turn off its auto-start, so the server shows nothing on port 80:
   `Stop-Website 'Default Web Site'; Set-ItemProperty 'IIS:\Sites\Default Web Site' serverAutoStart $false`.

2. Run the setup script. It is safe to run again. From your machine:

   ```powershell
   $session = New-PSSession -ComputerName web01.example.com -Credential $credential
   Invoke-Command -Session $session -FilePath deploy\iis\Install-CrossWordleSite.ps1
   ```

   It installs the IIS role services (static content, default document, HTTP errors, logging,
   request filtering, compression and the IIS PowerShell module). It also creates the following:
   - the `crosswordle` app pool (no .NET, ApplicationPoolIdentity);
   - the `crosswordle` site, on `http://127.0.0.1:8080/` unless you give it a binding;
   - `C:\inetpub\crosswordle\releases`, readable only by the app pool, writable only by
     administrators;
   - anonymous requests served as the app pool's identity, not the shared `IUSR`;
   - directory browsing removed (installing IIS adds it);
   - an unlock of the `handlers` section for this site only (IIS locks it by default, and the
     release's `web.config` maps `/api` to HttpPlatformHandler);
   - a `CF-Connecting-IP` field in the IIS log, so you can see visitors' addresses (every request
     comes through Cloudflare);

   The parameters, in `-ArgumentList` order:

   | #   | Parameter              | Default                  |                                                          |
   | --- | ---------------------- | ------------------------ | -------------------------------------------------------- |
   | 1   | site name              | `crosswordle`            |                                                          |
   | 2   | root folder            | `C:\inetpub\crosswordle` |                                                          |
   | 3   | port                   | `8080`                   | staging uses `8081`                                      |
   | 4   | address                | `127.0.0.1`              | one of the server's addresses, or `*`                    |
   | 5   | host names             | any                      | the names to answer for, as an array                     |
   | 6   | protocol               | `http`                   | or `https`                                               |
   | 7   | certificate            |                          | `https` only: its thumbprint, or a host name it covers   |
   | 8   | require SNI            | `$false`                 | `https` only: see [Your own binding](#your-own-binding)  |

   The staging site, beside the live one:

   ```powershell
   Invoke-Command -Session $session -FilePath deploy\iis\Install-CrossWordleSite.ps1 -ArgumentList `
       'Crosswordle-Staging', 'C:\inetpub\crosswordle-staging', 8081
   ```

   **The script sets the bindings to exactly what the parameters describe**, so always run it
   again with the parameters the site was installed with: run without them, it puts the site back
   on `http://127.0.0.1:8080/`. Bindings and a certificate mapping that already match are left
   untouched.

   If Windows asks for a restart after installing IIS, restart, then run the script again.

## Cloudflare Tunnel

The default. IIS stays on `http://127.0.0.1:8080/` (staging `8081`), as the install script leaves
it.

1. **Install cloudflared** on the server (the Windows MSI from Cloudflare; check its signature).
   Run it as a service with the tunnel's token: `cloudflared service install <token>`. Don't paste
   the token anywhere it's kept, such as a chat or your shell history; read it from your secret
   store into a variable. The service keeps the token in its configuration, which local users can
   read, so keep sign-ins to the server to administrators, and rotate the token in the tunnel's
   settings if it's ever exposed.
2. **Create the tunnel** in the Cloudflare account that owns the DNS zone (Cloudflare only routes a
   hostname to a tunnel in the same account). **Zero Trust → Networks → Tunnels → Create a
   tunnel**, type **Cloudflared**, and copy the connector token for step 1. Once the service runs,
   the tunnel shows as **Healthy**. If the zone is someone else's, they can add you as a member
   with Zero Trust and DNS roles, or create the tunnel and give you its token.
3. **Public hostnames:** `crosswordle.example.com` → service `HTTP` `127.0.0.1:8080`, and
   `crosswordle-staging.example.com` → `HTTP` `127.0.0.1:8081`. Each becomes a proxied CNAME to
   `<tunnel id>.cfargotunnel.com`. To keep staging private, add a **Self-hosted** application for
   its hostname in **Zero Trust → Access → Applications**, allowing only your email addresses.
4. **SSL/TLS:** leave it as it is. The edge certificate covers the hostname, and the hop from
   cloudflared to IIS is local.
5. Then the [zone settings](#zone-settings).

## Your own binding

Pass the binding's parameters (3 to 8 in the table above) to the install script. For example,
HTTPS on one of the server's addresses, answering only for the given names:

```powershell
Invoke-Command -Session $session -FilePath deploy\iis\Install-CrossWordleSite.ps1 -ArgumentList `
    'crosswordle', 'C:\inetpub\crosswordle', 443, '192.0.2.20', @('crosswordle.example.com'),
    'https', '0123456789ABCDEF0123456789ABCDEF01234567'
```

- **The certificate** is attached to the binding automatically, when the site is created and on
  every re-run, and deploys never touch it, so it stays through every redeploy. Name it by its
  thumbprint, or by a host name it covers (`'crosswordle.example.com'` in place of the thumbprint
  above): the script then uses the one certificate that covers that name (wildcards included),
  has its private key and is valid now, and stops if there's none or more than one.
- It must be in the server's `LocalMachine\My` store, and chain to a root the server trusts (a
  Cloudflare Origin CA certificate needs Cloudflare's Origin CA root in `LocalMachine\Root`). The
  deploy's check connects through the binding and needs that chain.
- **TLS 1.0 and 1.1 are refused.**
- **SNI.** Without it (the default), the certificate belongs to the address and port, and every
  site on them shares it: give it every site's name, or a wildcard. With SNI (`$true` as the
  eighth parameter), each site has its own certificate, picked by host name; clients must then
  send the name. The script refuses to change a certificate other sites share.
- Run the script again with the same parameters whenever you re-run it (see above), or the site
  goes back to the default binding.

Then the [zone settings](#zone-settings).

## Zone settings

1. **Rate limit:** in the zone, **Security → WAF → Rate limiting rules**, add a rule for
   URI path starts with `/api/`. The free plan has one rule.
2. Check the zone has **Always Use HTTPS** on and **Minimum TLS Version** at 1.2 or higher.
3. Keep **Rocket Loader**, **Email Address Obfuscation** and other features that rewrite pages off
   for this hostname (a **Configuration Rule** can turn them off for one host). They inject inline
   scripts, which the site's CSP blocks.

## Security

What protects the public site, and what to keep doing.

- **From the internet, the only way in should be through Cloudflare.** With the default binding,
  IIS listens only on loopback, for cloudflared. With a host name in the binding, IIS answers
  only for that name (others get HTTP.sys's "Invalid Hostname"). Node always listens on a
  loopback port that IIS picks and proxies to.
- **The forms' per-address rate limits trust `CF-Connecting-IP`.** That's sound only while nothing
  but Cloudflare can reach IIS: true with the default binding and the tunnel. With your own
  binding on a network address, anything else that can reach it could send the header itself and
  dodge the limits, so make sure only Cloudflare's traffic gets there, with the header set by
  Cloudflare.
- **Nothing on the server runs code from a request.** IIS has only static files,
  HttpPlatformHandler and URL Rewrite: no ASP.NET, CGI, ISAPI, WebDAV or directory browsing. The API parses JSON
  and compares letters. It never touches the file system, a shell or `eval`, and the site has no
  upload or write path.
- **Data and settings stay outside the releases.** `<root>\data` holds the database and
  `<root>\logs` the API's error log: the only folders the app pool can write to.
  `<root>\config.json` holds the site's settings (contact address, Turnstile keys); the install
  script creates it empty. `web.config` passes all three paths to Node (`CROSSWORDLE_DATA`,
  `CROSSWORDLE_LOGS`, `CROSSWORDLE_CONFIG`), and deploys never touch them. Set the settings with
  `Set-CrossWordleConfig.ps1` (contact address, Turnstile site key, and the secret key as a
  SecureString read from your secret store), which recycles the app pool so Node rereads it.
  Staging uses Cloudflare's always-pass Turnstile test keys. Node checks
  both at start-up, so a broken settings file or an unwritable data folder shows up as a failed
  deploy check, not as errors for players.
- **Least privilege.** Static files and Node both run as `IIS AppPool\crosswordle`, which can read
  the releases and nothing else. Only administrators can write them, and other local users can't
  read them (the answers bundle is there).
- **No leaks.**
  - No `Server` or `X-Powered-By` header, and no detailed error pages (which show server paths).
  - `web.config` and the `server` folder are never served.
  - The API's 500s say only `server-error`.
  - No source maps are built.
  - The deploy takes the server's name and credential at run time, so neither is in the repo.
- **Request filtering.** Only GET, HEAD and POST are allowed. Bodies are capped at 16 KB (the API's
  own limit), URLs at 1 KB and query strings at 512 bytes. Double-escaped and non-ASCII URLs are
  refused.
- **Headers** (`deploy/security-headers.json`, the same on every host):
  - The CSP allows only the site's own scripts, styles, images, fonts and API, and no inline
    script or style. Two exceptions, both Cloudflare's: Web Analytics (its script from
    `static.cloudflareinsights.com`, which reports to `cloudflareinsights.com`; Cloudflare adds
    the script to the page itself when Web Analytics is on), and the Turnstile bot check on forms
    (its script and frame from `challenges.cloudflare.com`, loaded only when a form needs it).
    Svelte sets styles through the CSSOM (`element.style`), which CSP permits,
    so `'unsafe-inline'` isn't needed. Injected `<style>` elements or `style=""` attributes are
    blocked.
  - Also sent: HSTS (one year, this hostname only), `nosniff`, no framing (CSP
    `frame-ancestors` and `X-Frame-Options`), `same-origin` COOP and CORP, `no-referrer`, and a
    Permissions-Policy that turns off the camera, microphone, location, payment and USB.
- **Patching.** Windows Update covers IIS. Node.js isn't updated automatically: install each
  Node 22 security release (or the next LTS before 22 reaches end of life in April 2027), then
  recycle the app pool. `npm audit --omit=dev` covers what ships; the server bundle has no
  third-party packages.
- **Logs.** IIS logs (with each visitor's address, from `CF-Connecting-IP`) are in
  `C:\inetpub\logs\LogFiles` and grow without limit. Delete old ones from time to time.

## Deploying

From your machine, with the server reachable for PowerShell remoting:

```powershell
$env:CROSSWORDLE_IIS_HOST = 'web01.example.com'
.\scripts\deploy-iis.ps1 -Credential $credential
```

The deploy works like this:

1. It refuses uncommitted work.
2. It runs `npm run build:iis` and copies `dist\iis` to `releases\<commit sha>`.
3. It points the site at the new release and recycles the app pool.
4. On the server, it checks the home page, and checks that `POST /api/guess` answers
   `unknown-entry` for the sample puzzle. It sends both straight to the site's first binding
   (HTTP or HTTPS, with the binding's host name), never out through Cloudflare. Over HTTPS the
   certificate must chain to a root the server trusts; a name it doesn't cover is only a warning.
   If either check fails, the site goes back to the release it was on before.
5. It keeps the five newest releases.

To go back one release, run `.\scripts\deploy-iis.ps1 -Credential $credential -Rollback`.

Pages builds from `main` on every push. IIS gets a release only when you run the deploy. Puzzles
are generated ahead of time, so **deploy again before the last committed puzzle date**, or the
IIS site runs out of puzzles.

## Reviewing leaderboard results

When a ranked game finishes, the server flags it for a look if it seems too good: a strong first
game from a new player id, every entry solved first time, an unusually fast finish, or one much
faster than that player's usual (`server/review.ts` has the thresholds). **A flag never changes
the leaderboard.** Only an admin's decision does:

```powershell
$admin = 'deploy\iis\Invoke-CrossWordleAdmin.ps1'
$site = 'crosswordle', 'C:\inetpub\crosswordle'
# Flagged results awaiting a decision (add '--all' for decided ones too):
Invoke-Command -Session $session -FilePath $admin -ArgumentList ($site + ,@('review'))
# Off the board, kept in the player's own record; or keep it on the board (undoes a hide):
Invoke-Command -Session $session -FilePath $admin -ArgumentList ($site + ,@('hide', '2026-11-05', '0b6f8f4e'))
Invoke-Command -Session $session -FilePath $admin -ArgumentList ($site + ,@('keep', '2026-11-05', '0b6f8f4e'))
```

The player is the id the list shows (its first 8 characters are enough). The script runs the live
release's `serverdmin.mjs` on the site's database, so the command always matches the schema.

## Health and usage

- **`GET /api/health`** is for an uptime monitor. It's public on purpose and linked from nowhere,
  and answers in one word: `{"status":"ok"}` (200), `{"status":"ok","warning":"puzzles"}` (200,
  under 7 days of puzzles left) or `{"status":"down"}` (503: the database, the data folder or
  today's puzzles failed). Nothing else: no versions, paths or errors. The answer is kept for 30
  seconds, and sent `no-store`.
- **The monitor** must run somewhere other than this server, or it can't report the server being
  down. A free service (UptimeRobot or similar) works:
  1. Create a monitor of type **Keyword**, URL `https://crosswordle.example.com/api/health`,
     every 5 minutes, alerting when the keyword `"ok"` is **missing**. That catches 503s, timeouts
     and Cloudflare's own error pages.
  2. Create a second **Keyword** monitor on the same URL alerting when `puzzles` **exists**, as a
     reminder to generate more puzzles.
  3. Alert contact: the admin mailbox.
- **On the server,** with the admin wrapper (`Invoke-CrossWordleAdmin.ps1`):
  - `@('health')`: every check with its result and time, the last puzzle date and days left
    (daily and Naughty), the live release, database size, free disk, the last backup and the
    errors in the last 24 hours.
  - `@('stats')` or `@('stats', '--from', '2026-11-01', '--to', '2026-11-30')`: per puzzle
    (started, finished, won, lost, ranked, restarted, guesses, both kinds of clue) and per UTC
    day (page loads, new players, active players), plus player ids ever and those that never
    made a guess. Page loads are counted when the page asks `/api/features`, once per load, with
    nothing about who.

## Testing

- **On your machine:** run `npm run build:iis`, then `$env:PORT = 8787; node dist\iis\server\server.mjs`,
  and `POST` to `http://127.0.0.1:8787/api/guess`. This runs only the API; use `npm run preview` for
  the full stack.
- **On the server:** open the site there (see the binding in IIS), or open it through its public
  name. Then:
  - play a guess and a hint, in both daily and Naughty mode;
  - check the browser console for CSP errors;
  - check the response headers: `curl -I https://crosswordle-staging.example.com/assets/<file>`.
- **Staging site:** a second site on the same server, so tests never touch the live one. Create
  it once with the install script (see step 2 of the setup), then deploy a branch to it with
  `.\scripts\deploy-iis.ps1 -Credential $credential -SiteName Crosswordle-Staging -Root C:\inetpub\crosswordle-staging`.
  To run the browser tests against it, run them on the server with `CROSSWORDLE_BASE_URL` set to
  its address (`http://127.0.0.1:8081` with the default binding, or its public name), then
  `npm run test:e2e`. Playwright then uses the deployed site and doesn't start its own.
- **API errors:** the API writes its own error log to `<root>\logs` (`errors-YYYY-MM-DD.log`, one
  JSON line per error, 14 days kept), including a failure to start. Read it with the admin
  command: `Invoke-CrossWordleAdmin.ps1` with `@('errors')` (last 24 hours) or
  `@('errors', '--hours', '72')`. Sites installed before the log existed need the install script
  run again (same parameters) to create `logs` with the app pool's write access.
- **Node's own output:** only if the API won't start and the error log is empty (say, Node itself
  is missing), set `stdoutLogEnabled="true"` and `stdoutLogFile="..\..\..\logs\node"` on
  `<httpPlatform>` in the live release's `web.config`, and read that file. Turn it off again
  afterwards: it isn't rotated.

## Switching hosts

The public name can point at Pages (a **DNS only** CNAME to `<project>.pages.dev`) or at IIS (a
**proxied** record: the tunnel's, or your own), not both at once.

**Pages → IIS:**

1. Deploy to IIS the commit that Pages is serving, and test it on the staging name.
2. In the Pages project, **Custom domains**: remove `crosswordle.example.com`.
3. In the zone's DNS, delete the `crosswordle` CNAME to `<project>.pages.dev`.
4. Point `crosswordle.example.com` at IIS, **proxied**: add it as the tunnel's public hostname, or
   point the record at your own route to the server (test it first on a second name routed the
   same way).
5. Check from outside:
   - The name resolves to Cloudflare's addresses.
   - HTTPS returns 200 with the security headers.
   - Today's puzzle loads, and a guess and a hint both work.
   - The IIS log shows the visit with `CF-Connecting-IP`.

**IIS → Pages:** do the same in reverse. Add back the DNS only CNAME to `<project>.pages.dev` in
place of the proxied record, then add the custom domain back in the Pages project. Pages checks
the domain again, which takes a few minutes.

While IIS serves the name, Pages can keep building. Its `<project>.pages.dev` address stays up as
a fallback.
