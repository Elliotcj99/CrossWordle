# Private lab hosting

The site is static, so the lab host only needs nginx. Deploys run from your own machine with
`scripts/deploy-lab.mjs`, which builds the site and uploads each release over SSH. Nothing runs
on GitHub, and no host names, users or keys are kept in the repo.

## One-time server setup

1. A small Linux VM (1 vCPU, 1 GB RAM is plenty) with nginx.
2. A deploy user that can write to `/srv/crosswordle` and nothing else:
   ```sh
   sudo useradd --system --create-home --shell /bin/bash crosswordle-deploy
   sudo mkdir -p /srv/crosswordle/releases
   sudo chown -R crosswordle-deploy: /srv/crosswordle
   ```
   Add the public half of a new, dedicated SSH key to `~crosswordle-deploy/.ssh/authorized_keys`.
3. A certificate for the site's name from the lab CA, installed at the paths in
   `deploy/nginx/crosswordle.conf`, and a DNS record for that name.
4. The headers snippet and the site:
   ```sh
   node scripts/render-headers.mjs --format nginx --out crosswordle-headers.conf
   sudo install -m 644 crosswordle-headers.conf /etc/nginx/snippets/
   sudo install -m 644 deploy/nginx/crosswordle.conf /etc/nginx/sites-available/
   sudo ln -s ../sites-available/crosswordle.conf /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
   Re-render and reload whenever `deploy/security-headers.json` changes.

## One-time setup on your machine

Add an SSH host alias, so the server's name, user and key stay out of the repo:

```
# ~/.ssh/config
Host crosswordle-lab
    HostName web01.example.com
    User crosswordle-deploy
    IdentityFile ~/.ssh/crosswordle_deploy
    IdentitiesOnly yes
```

Then run `ssh crosswordle-lab true` once, check the host key fingerprint, and accept it. The
deploy refuses unknown host keys.

## Deploying

```sh
npm run deploy:lab -- --host crosswordle-lab
```

Set `CROSSWORDLE_LAB_HOST` instead of passing `--host`, and `--path` or `CROSSWORDLE_LAB_PATH`
if the site isn't at `/srv/crosswordle`. A deploy does the following:

1. Refuse to deploy if there are uncommitted changes, so every release matches a commit.
2. Build `apps/web/dist`.
3. Upload it to `releases/<commit sha>`.
4. Point the `current` symlink at it in one atomic rename. Visitors never see a half-copied site.
5. Keep the five newest releases. Roll back by pointing `current` at an older one.
