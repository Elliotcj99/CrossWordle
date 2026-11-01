# Hosting on IIS behind a Cloudflare Tunnel

An alternative to Cloudflare Pages: the same site and API, served from a Windows Server by IIS and
reached from the internet only through a Cloudflare Tunnel. Nothing is opened inbound on the
server's network. Pages keeps working as it does now, so either host can serve the public name, and
switching between them is a DNS change (see [Switching hosts](#switching-hosts)).

```
Browser ─HTTPS─▶ Cloudflare edge (crosswordle.example.com, proxied)
                     │  tunnel (outbound from the server)
                     ▼
            cloudflared (Windows service) ──http://127.0.0.1:8080──▶ IIS site "crosswordle"
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
- **IIS listens on 127.0.0.1 only.** The only way in is through cloudflared, so nobody can reach the
  server around Cloudflare.
- The app uses `#` URLs (`#2026-10-24`), so no rewrite rules are needed for routing. URL Rewrite
  has one job: answering folder URLs (`/assets/`) with a 404, as Pages does, instead of IIS's
  empty 200.

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
   - the `crosswordle` site on `http://127.0.0.1:8080/`;
   - `C:\inetpub\crosswordle\releases`, readable only by the app pool, writable only by
     administrators;
   - anonymous requests served as the app pool's identity, not the shared `IUSR`;
   - directory browsing removed (installing IIS adds it);
   - an unlock of the `handlers` section for this site only (IIS locks it by default, and the
     release's `web.config` maps `/api` to HttpPlatformHandler);
   - a `CF-Connecting-IP` field in the IIS log, so you can see visitors' addresses (every request
     comes from cloudflared on 127.0.0.1).

   Change the defaults with `-ArgumentList <site>, <root>, <port>`. If Windows asks for a restart
   after installing IIS, restart, then run the script again.

3. Install **cloudflared** (Windows MSI from Cloudflare). Run it as a service with the tunnel's token
   (see the next section): `cloudflared service install <token>`. Don't paste the token anywhere
   it's kept, such as a chat or your shell history. Read it from your secret store into a variable.

## Cloudflare (dashboard)

A tunnel's public hostname is a proxied CNAME to `<tunnel id>.cfargotunnel.com`. Cloudflare only
routes it to a tunnel **in the same account as the DNS zone**. Create the tunnel in the account that
owns the domain. If that's someone else's account, they can either add you as a member with Zero
Trust and DNS roles, or create the tunnel and give you its token.

1. **Zero Trust → Networks → Tunnels → Create a tunnel**, type **Cloudflared**. Name it, then copy
   the connector token for step 3 above. Once the service runs, the tunnel shows as **Healthy**.
2. **Public hostname:** `crosswordle-staging.example.com` → service `HTTP` `127.0.0.1:8080`. Start
   with a staging name, so the live site isn't affected.
3. **Protect the staging name:** in **Zero Trust → Access → Applications**, add a **Self-hosted**
   application for the staging hostname. Give it a policy that allows only your email addresses.
4. **Rate limit:** in the zone, **Security → WAF → Rate limiting rules**, add a rule for
   URI path starts with `/api/`. The free plan has one rule.
5. Leave **SSL/TLS** as it is. The edge certificate covers the hostname, and the hop from
   cloudflared to IIS is local. Check the zone has **Always Use HTTPS** on and **Minimum TLS
   Version** at 1.2 or higher.
6. Keep **Rocket Loader**, **Email Address Obfuscation** and other features that rewrite pages off
   for this hostname (a **Configuration Rule** can turn them off for one host). They inject inline
   scripts, which the site's CSP blocks.

## Security

What protects the public site, and what to keep doing.

- **Nothing is reachable except through Cloudflare.** IIS binds to 127.0.0.1; from the LAN, port
  8080 only gets HTTP.sys's "Invalid Hostname". Node listens on a loopback port that IIS picks
  and proxies to.
- **Nothing on the server runs code from a request.** IIS has only static files,
  HttpPlatformHandler and URL Rewrite: no ASP.NET, CGI, ISAPI, WebDAV or directory browsing. The API parses JSON
  and compares letters. It never touches the file system, a shell or `eval`, and the site has no
  upload or write path.
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
    script or style. Svelte sets styles through the CSSOM (`element.style`), which CSP permits,
    so `'unsafe-inline'` isn't needed. Injected `<style>` elements or `style=""` attributes are
    blocked.
  - Also sent: HSTS (one year, this hostname only), `nosniff`, no framing (CSP
    `frame-ancestors` and `X-Frame-Options`), `same-origin` COOP and CORP, `no-referrer`, and a
    Permissions-Policy that turns off the camera, microphone, location, payment and USB.
- **The tunnel token.** `cloudflared service install <token>` stores the token in the service's
  configuration, which local users can read. Keep sign-ins to the server to administrators. If
  the token is ever exposed, rotate it in the tunnel's settings.
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
- **On the server:** open `http://127.0.0.1:8080/` there, or open the staging hostname through
  Access. Then:
  - play a guess and a hint, in both daily and Naughty mode;
  - check the browser console for CSP errors;
  - check the response headers: `curl -I https://crosswordle-staging.example.com/assets/<file>`.
- **API logs:** if `/api` returns 502, set `stdoutLogEnabled="true"` and
  `stdoutLogFile="..\..\..\logs\api"` on `<httpPlatform>` in the live release's `web.config`. Create
  the `logs` folder, give the app pool modify rights on it, and read the log.

## Switching hosts

The public name can point at Pages (a **DNS only** CNAME to `<project>.pages.dev`) or at the tunnel
(a **proxied** CNAME to `<tunnel id>.cfargotunnel.com`), not both at once.

**Pages → IIS:**

1. Deploy to IIS the commit that Pages is serving, and test it on the staging name.
2. In the Pages project, **Custom domains**: remove `crosswordle.example.com`.
3. In the zone's DNS, delete the `crosswordle` CNAME to `<project>.pages.dev`.
4. In the tunnel, add the public hostname `crosswordle.example.com` → `HTTP` `127.0.0.1:8080`.
   This creates the proxied CNAME.
5. Check from outside:
   - The name resolves to Cloudflare's addresses.
   - HTTPS returns 200 with the security headers.
   - Today's puzzle loads, and a guess and a hint both work.
   - The IIS log shows the visit with `CF-Connecting-IP`.

**IIS → Pages:** do the same in reverse. Remove the tunnel's public hostname, add back the DNS only
CNAME to `<project>.pages.dev`, then add the custom domain back in the Pages project. Pages checks
the domain again, which takes a few minutes.

While IIS serves the name, Pages can keep building. Its `<project>.pages.dev` address stays up as
a fallback.
