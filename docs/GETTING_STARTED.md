# Getting started

This guide takes you from a fresh clone to a running Piston, either for local development or for a self-hosted production install, and shows how to create the first account.

## Prerequisites

| Tool                                                  | Version | Used for                                  |
| ----------------------------------------------------- | ------- | ----------------------------------------- |
| [Bun](https://bun.sh)                                 | 1.3+    | Installing, running and testing the app   |
| [Docker](https://docs.docker.com/get-docker/) Compose | v2      | PostgreSQL in dev, the whole app in prod  |
| An [Anthropic API key](https://console.anthropic.com) | —       | Every Claude feature (review, letters...) |

## 1. Configure the environment

```bash
cp .env.example .env
```

Then edit `.env`:

- `ANTHROPIC_API_KEY`: your Anthropic API key.
- `NUXT_SESSION_PASSWORD`: a random secret of at least 32 characters, used to encrypt session cookies. Generate one with `openssl rand -base64 32`.
- `TAVILY_API_KEY` (optional): enables job search and importing an offer from a link. Free tier at [tavily.com](https://tavily.com). Without it, those features are hidden.
- In production, change `POSTGRES_PASSWORD`.

Every variable is documented in [`.env.example`](../.env.example). The `.env` file is git-ignored; never commit it.

## 2a. Run locally (development)

```bash
bun install
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL 17 on localhost:5432
bun run db:migrate                               # apply the SQL migrations
bun run db:seed                                  # optional: a demo user with a sample resume
bun dev                                          # http://localhost:3000
```

The seed creates `demo@example.com` / `demo-password`. It is meant for development only.

If port 3000 is busy, Nuxt picks the next free one and prints it.

## 2b. Run in production (self-hosting)

```bash
docker compose up -d --build
```

That's it: Compose builds the app image, starts PostgreSQL with a named volume (`piston-db`), waits for it to be healthy, and starts the app, which applies pending migrations before serving requests. The app listens on port `3000` (change it with `PISTON_PORT` in `.env`).

Put it behind a reverse proxy that terminates HTTPS (Caddy, Traefik, nginx). Session cookies are `httpOnly` and `sameSite=lax`, and marked `secure` in production, so HTTPS is required for login to work from another machine.

To update: `git pull && docker compose up -d --build`. Your data lives in the `piston-db` volume and survives rebuilds.

### Behind nginx-proxy, with continuous deployment

If your server already runs [nginx-proxy](https://github.com/nginx-proxy/nginx-proxy) with its Let's Encrypt companion, add `docker-compose.proxy.yml`: the app is then served only through the proxy, at `https://$PISTON_DOMAIN`, with a certificate issued and renewed automatically.

1. Point the domain's DNS to the server.
2. In the server's `.env`, set `PISTON_DOMAIN`, `LETSENCRYPT_EMAIL` and `PROXY_NETWORK` (the Docker network the proxy container is attached to).
3. Start it:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d --build
   ```

To deploy on every push to `main` once the CI passes, enable the `deploy` job of `.github/workflows/ci.yml`: in the GitHub repository settings, add the secrets `SSH_HOST`, `SSH_USER` and `SSH_KEY` (a key allowed to log in to the server) and the variable `DEPLOY_ENABLED=true` (optionally `DEPLOY_PATH`, default `~/piston`). The job copies the code over SSH and runs the command above. The server's `.env` is never overwritten: application secrets stay on the server, GitHub only holds the SSH access.

## 3. Create the first account

Piston has no open sign-up: an account is created either from an invitation link (valid 7 days, usable once) or from an access request (« Demander un accès » on the login page) that an admin accepts. On a fresh install there is nobody to invite you yet, so create the first link from the command line.

**Development:**

```bash
bun run db:invite
# Invitation link (valid 7 days):
# http://localhost:3000/invite/2f9c...
```

**Production (Docker):** while the database has no user, the app prints an invitation path in its logs at startup:

```bash
docker compose logs web | grep invite
# [piston] No account yet. Create the first one with this invitation link (valid 7 days): /invite/2f9c...
```

Prefix it with your public URL (for example `https://piston.example.com/invite/2f9c...`). If it expired, restart the container to get a new one.

Open the link, choose a name, e-mail and password, and you are in. From then on, any logged-in user can invite friends with the « Inviter un ami » button in the sidebar, which copies a fresh link to the clipboard.

Then make yourself an admin, so you can review access requests and see the totals in « Administration » (`/admin`):

```bash
docker compose exec web bun cli/user.js make-admin you@example.com   # production
bun run user:make-admin you@example.com                              # development
```

The link appears in your menu at once. An admin can then grant the role to others from the « Membres » tab; `revoke-admin` removes it from the command line.

## 4. First steps in the app

On their first visit, new members get a short welcome, a « Premiers pas » progress on the home page and a one-time tip on the main pages (« Mon compte › Revoir l'introduction » shows them again). The path they follow:

1. **CV**: paste your resume or import a PDF (5 MB max, text-based PDFs only; the original file is kept and can be downloaded again), then click « Critiquer ». Versions can be renamed, downloaded and deleted. If you apply in several fields, create one profile per specialty (the profile menu at the top right of the page, « Nouveau profil ») and pick the CV each offer uses on its page; the default profile is used otherwise. « Mon compte » (user menu) lets you export or delete your data.

   **Mises en page** (a tab of the same page, next to « Critique » and « Versions »): build a structured CV from a version or from a short interview with Claude, pick a template, accept or reject Claude's suggested edits, download the PDF, and « Enregistrer comme version » so the other features use it.

2. **Offres**: paste a job offer. Piston analyzes the fit with your resume, then writes a cover letter you can edit paragraph by paragraph.
3. **Candidatures**: add the offer to the kanban and move it from « À envoyer » to « Terminée ».
4. **Pistes**: get adjacent job titles, job-board keywords and company types to target.

Each user can run 30 Claude calls per rolling 24 hours (`DAILY_GENERATION_LIMIT`; offer imports count) and 50 web searches or imports, and can create 5 invitations per week. See [Limiting costs](#limiting-costs) for the server-wide caps.

## Operations

Everything below is for the server running the Docker Compose stack. If you start it with `docker-compose.proxy.yml`, run `export COMPOSE_FILE=docker-compose.yml:docker-compose.proxy.yml` first so that every `docker compose` command and script sees the same services.

### Backups

The `backup` service dumps the database every day at `BACKUP_HOUR` (03:00 UTC by default) into the `piston-backups` volume, as `piston-YYYYMMDD-HHMMSS.sql.gz`, and deletes dumps older than `BACKUP_KEEP_DAYS` (14). A dump is checked (`gzip -t`) before it replaces the temporary file, and each run logs one line:

```bash
docker compose logs backup        # [backup] ... OK piston-20261026-030000.sql.gz (36.0K)
scripts/backup-now.sh             # take a backup now and list the ones kept
```

**Off-site copy.** The volume lives on the same disk as the database, so it does not protect you from losing the server. Set `BACKUP_S3_URL` (for example `s3://my-bucket/piston`) with `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_DEFAULT_REGION` in `.env`, and every dump is also uploaded. Any S3-compatible provider works (Cloudflare R2, Backblaze B2, Scaleway...): add `AWS_ENDPOINT_URL`. The service installs the `aws-cli` Alpine package when it starts with this option; a failed upload is logged and never deletes the local copy. Rotation in the bucket is the provider's job (a lifecycle rule that expires objects after N days).

**Restore** (replaces all current data; the app is stopped during the restore):

```bash
scripts/restore-backup.sh piston-20261026-030000.sql.gz     # a dump kept in the volume
scripts/restore-backup.sh ./downloaded-dump.sql.gz          # a file on the server (e.g. from the bucket)
```

The script checks that the file is readable, asks you to type `restore`, stops `web`, replays the dump (stopping at the first SQL error) and starts `web` again. Restore a fresh dump on a test database from time to time: a backup you never restored is a hope, not a backup.

### Administration

The « Administration » page (admins only) has four tabs:

- **Aperçu** — members, active members over 7 days, applications per kanban column, AI generations, and the server's spending: Claude cost this month against `CLAUDE_MONTHLY_BUDGET_USD`, calls in the last 24 h against the global daily cap, the same for Tavily, the cost per feature and a 30-day activity chart. Amounts are the ledger's estimates (see [Limiting costs](#limiting-costs)).
- **Demandes** — access requests sent from `/demande`. The requester chooses their password up front, so « Accepter » creates the account and they can log in at once (tell them: Piston sends no e-mail). Until then, logging in answers that the request is pending. A rejected request has its password hash erased. At most 30 requests can wait at once and one IP address may send 5 per 15 minutes, so the form cannot be used to fill the database. The sidebar shows how many are waiting.
- **Membres** — every account with its offers, applications, Claude calls and estimated cost over 30 days, and the last activity. Actions: grant or remove the admin role, reset a password (a temporary password shown once, all sessions closed), delete an account. An admin cannot remove their own role or delete their own account here.
- **Invitations** — create links outside the members' weekly quota, and revoke a link that has not been used.

### Lost password

There is no « forgot my password » e-mail: Piston sends no e-mail. An admin resets it from « Administration › Membres », or whoever has shell access to the server does it from the command line; the user then changes it in « Mon compte »:

```bash
docker compose exec web bun cli/user.js list
docker compose exec web bun cli/user.js reset-password ada@example.com
# New temporary password for ada@example.com (shown once):
# Xk7pQ...
```

In development, the same commands are `bun run user:list` and `bun run user:reset-password <email>`. A reset logs the user out of every device. The image carries the tool as a single bundled file (`/app/cli/user.js`) because the runtime image has no sources; it needs no network port or token, which is why it is the only way in.

### Security

- **Login throttling.** 10 failed logins per e-mail and 30 per IP address in 15 minutes lock that key (« Trop de tentatives, réessaie dans quelques minutes. », HTTP 429); a successful login resets the e-mail counter. Failed sign-ups with an unusable invitation (10 per IP) and invitation link checks (60 per IP) are limited the same way. Counters live in the `auth_attempts` table, so they survive restarts. Behind a reverse proxy the app only sees the proxy's address: `TRUST_PROXY=true` (already set by `docker-compose.proxy.yml`) makes it read the client address that the proxy appends to `X-Forwarded-For`. Enable it only when the app is reachable exclusively through that single proxy; with a CDN in front of the proxy, every visitor would share the CDN's address.
- **Sessions.** The cookie is encrypted, `httpOnly`, `secure` and `sameSite=lax`, and expires `SESSION_MAX_AGE` seconds after login (30 days by default). Changing or resetting a password invalidates every other session at once.
- **Headers.** Every response carries `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`; HTTPS responses add `Strict-Transport-Security` (one year). Pages carry a Content-Security-Policy that allows only the app's own origin, plus `data:` and `blob:` images and workers for the CV preview and photo crop, and a per-request nonce for the inline scripts Nuxt renders. After an upgrade, if something misbehaves in the browser, set `CSP_REPORT_ONLY=true`, restart, and read the console: it lists what the policy would have blocked.

### Monitoring

- **Logs.** Unexpected server errors (HTTP 5xx) are written as one JSON line each: `time`, `level`, `requestId`, `method`, `route` (opaque tokens removed), `status`, `userHash` (a keyed hash, never the user), `name`, `message` (first line only) and a short stack. Request bodies, query strings, e-mails and document content are never logged. Every response has an `X-Request-Id` header: a user quoting it lets you find the line.

  ```bash
  docker compose logs web | grep '"level":"error"'
  ```

- **Health.** `GET /api/health` answers `{ "status": "ok", "db": "ok", "disk": { "freePercent": 41 } }`. The status is `degraded` below 5 % free disk and the HTTP status is 503 when the database is unreachable.
- **Uptime monitor.** Point [Uptime Kuma](https://github.com/louislam/uptime-kuma) (or any HTTP monitor) at `https://your-domain/api/health` with the keyword `"status":"ok"`, and send alerts to the channel you read. There is no Sentry integration: for a small self-hosted app, JSON logs plus an uptime monitor cover what matters without sending error data to a third party.

## Limiting costs

Piston calls two paid APIs on your account. Every call is recorded in a usage ledger (before it starts, so aborted and failed calls count) and checked against these limits, all configurable in `.env`:

| Variable                    | Default | Meaning                                                             |
| --------------------------- | ------- | ------------------------------------------------------------------- |
| `DAILY_GENERATION_LIMIT`    | 30      | Claude calls per user per rolling 24 hours                          |
| `CLAUDE_GLOBAL_DAILY_LIMIT` | 300     | Claude calls per rolling 24 hours, all users together               |
| `CLAUDE_MONTHLY_BUDGET_USD` | 25      | Estimated Claude spend per calendar month (UTC), in USD             |
| `TAVILY_GLOBAL_DAILY_LIMIT` | 300     | Tavily calls (searches and imports) per rolling 24 hours, all users |
| `TAVILY_MONTHLY_CREDITS`    | 1000    | Tavily credits per calendar month (1000 is the free tier)           |

Users are also limited to 50 Tavily calls per day and 5 invitations per week. When a global limit is reached, users see a French message (« Le quota quotidien du serveur est atteint » or « Le budget mensuel de l'IA de ce serveur est atteint »); the server logs a warning at 80 % of a monthly budget.

These limits rely on cost **estimates** computed by the app. They are a safety net, not a guarantee. To be sure you cannot be overcharged:

- **Set a spend limit in the Anthropic Console** (Settings, Limits, and the workspace spend limit of the workspace your API key belongs to). Use a dedicated workspace for Piston.
- **Keep Tavily on a plan with a credit cap** (the free tier stops at 1000 credits a month; do not enable pay-as-you-go unless you want it).

Those provider-side limits are the only protection against a bug in the app.

## Troubleshooting

| Symptom                                         | Fix                                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL is not set`                       | Run the commands from the repository root, where `.env` lives.                                                    |
| `ECONNREFUSED 127.0.0.1:5432`                   | The dev database is not running: `docker compose -f docker-compose.dev.yml up -d`.                                |
| Login works locally but not through your domain | Serve the app over HTTPS: the session cookie is `secure` in production.                                           |
| « Trop de tentatives » when logging in          | Wait 15 minutes. Behind a proxy, check `TRUST_PROXY=true` (see Operations), or all visitors share one address.    |
| Icons or fonts missing, CSP errors in console   | Set `CSP_REPORT_ONLY=true`, restart, and read the console to see which source the policy blocks.                  |
| « La clé API Claude du serveur est invalide »   | Check `ANTHROPIC_API_KEY` in `.env`, then restart (`docker compose up -d`).                                       |
| The CV preview stays empty                      | The browser could not load pdf.js (old browser or blocked script): download the PDF instead, it is the same file. |
| PDF import says the file looks like an image    | The PDF is a scan without a text layer: paste the text instead.                                                   |
