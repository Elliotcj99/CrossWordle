# Hosting on IIS behind a reverse proxy

The same site and API as on Cloudflare Pages, served from a Windows Server by IIS. The public name
is proxied by Cloudflare, which forwards to a reverse proxy (such as HAProxy) in front of the
server's network. The proxy forwards to IIS. Pages keeps working as it does now, so either host can
serve the public name, and switching between them is a DNS change (see
[Switching hosts](#switching-hosts)).

```
Browser ─HTTPS─▶ Cloudflare edge (crosswordle.example.com, proxied)
                     │  HTTPS, Full (strict), Authenticated Origin Pulls
                     ▼
            Reverse proxy (DMZ) ──http://192.0.2.20:8080──▶ IIS site "crosswordle"
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
- **The public path is Cloudflare, then the reverse proxy.** The proxy accepts CrossWordle traffic
  only from Cloudflare, and IIS answers only for the site's own host names. The script leaves the
  server's firewall alone; the network decides which machines can reach IIS's port.
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
   - the `crosswordle` site, on `http://127.0.0.1:8080/` unless you give it an address;
   - `C:\inetpub\crosswordle\releases`, readable only by the app pool, writable only by
     administrators;
   - anonymous requests served as the app pool's identity, not the shared `IUSR`;
   - directory browsing removed (installing IIS adds it);
   - an unlock of the `handlers` section for this site only (IIS locks it by default, and the
     release's `web.config` maps `/api` to HttpPlatformHandler);
   - a `CF-Connecting-IP` field in the IIS log, so you can see visitors' addresses (every request
     comes from the reverse proxy);

   The parameters, in `-ArgumentList` order, are the site name, root folder, port, the address to
   listen on (`127.0.0.1`, one of the server's addresses, or `*`), and the host names to answer
   for. Behind a reverse proxy on another machine:

   ```powershell
   Invoke-Command -Session $session -FilePath deploy\iis\Install-CrossWordleSite.ps1 -ArgumentList `
       'crosswordle', 'C:\inetpub\crosswordle', 8080, '192.0.2.20', @('crosswordle.example.com')
   ```

   If Windows asks for a restart after installing IIS, restart, then run the script again.

3. On the reverse proxy, route the public host names to the server's address and port. Keep the
   `Host` header, pass `CF-Connecting-IP` through, and health-check `GET /`.

## Cloudflare and the reverse proxy

1. **DNS:** the public name is a **proxied** record pointing at the reverse proxy's public address.
2. **SSL/TLS:** **Full (strict)**, with a Cloudflare **Origin CA** certificate for the host name on
   the proxy. If other sites in the zone can't use Full (strict), set it for this host name only
   with a **Configuration Rule**.
3. **Authenticated Origin Pulls:** turn it on, and have the proxy require Cloudflare's client
   certificate for this host name. Then only Cloudflare can reach the site, so `CF-Connecting-IP`
   can be trusted. Also limiting the host name to Cloudflare's IP ranges adds a second layer.
4. **Rate limit:** in the zone, **Security → WAF → Rate limiting rules**, add a rule for
   URI path starts with `/api/`. The free plan has one rule.
5. Check the zone has **Always Use HTTPS** on and **Minimum TLS Version** at 1.2 or higher.
6. Keep **Rocket Loader**, **Email Address Obfuscation** and other features that rewrite pages off
   for this hostname (a **Configuration Rule** can turn them off for one host). They inject inline
   scripts, which the site's CSP blocks.

## Security

What protects the public site, and what to keep doing.

- **From the internet, the only way in is through Cloudflare.** The proxy accepts the host name only
  with Cloudflare's origin-pull certificate, and IIS answers only for its own host names (others
  get HTTP.sys's "Invalid Hostname"). Node listens on a loopback port that IIS picks and proxies
  to. Machines on the server's own network can still reach IIS's port directly, so only trust
  `CF-Connecting-IP` for logging, not for access decisions.
- **Nothing on the server runs code from a request.** IIS has only static files,
  HttpPlatformHandler and URL Rewrite: no ASP.NET, CGI, ISAPI, WebDAV or directory browsing. The API parses JSON
  and compares letters. It never touches the file system, a shell or `eval`, and the site has no
  upload or write path.
- **Data and settings stay outside the releases.** `<root>\data` holds the database: the only
  folder the app pool can write to. `<root>\config.json` holds the site's settings (contact
  address, Turnstile keys); the install script creates it empty. `web.config` passes both paths to
  Node (`CROSSWORDLE_DATA`, `CROSSWORDLE_CONFIG`), and deploys never touch either. Set it with
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
   `unknown-entry` for the sample puzzle. If either check fails, the site goes back to the release
   it was on before.
5. It keeps the five newest releases.

To go back one release, run `.\scripts\deploy-iis.ps1 -Credential $credential -Rollback`.

Pages builds from `main` on every push. IIS gets a release only when you run the deploy. Puzzles
are generated ahead of time, so **deploy again before the last committed puzzle date**, or the
IIS site runs out of puzzles.

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
  it once with the install script (`-ArgumentList 'Crosswordle-Staging',
'C:\inetpub\crosswordle-staging', 8081`), then deploy a branch to it with
  `.\scripts\deploy-iis.ps1 -Credential $credential -SiteName Crosswordle-Staging -Root C:\inetpub\crosswordle-staging`.
  To run the browser tests against it, run them on the server with
  `$env:CROSSWORDLE_BASE_URL = 'http://127.0.0.1:8081'; npm run test:e2e`. Playwright then uses
  the deployed site and doesn't start its own.
- **API logs:** if `/api` returns 502, set `stdoutLogEnabled="true"` and
  `stdoutLogFile="..\..\..\logs\api"` on `<httpPlatform>` in the live release's `web.config`. Create
  the `logs` folder, give the app pool modify rights on it, and read the log.

## Switching hosts

The public name can point at Pages (a **DNS only** CNAME to `<project>.pages.dev`) or at the reverse
proxy (a **proxied** record to its public address), not both at once.

**Pages → IIS:**

1. Deploy to IIS the commit that Pages is serving, and test it on the staging name.
2. In the Pages project, **Custom domains**: remove `crosswordle.example.com`.
3. In the zone's DNS, delete the `crosswordle` CNAME to `<project>.pages.dev`.
4. Point `crosswordle.example.com` at the reverse proxy's public address, **proxied**. The proxy
   already routes the name to IIS (test it first on a second name routed the same way).
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
