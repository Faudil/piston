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

## 3. Create the first account

Piston has no public sign-up: every account is created from an invitation link, valid 7 days and usable once. On a fresh install there is nobody to invite you yet, so create the first link from the command line.

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

## 4. First steps in the app

1. **CV**: paste your resume or import a PDF (5 MB max, text-based PDFs only; the original file is kept and can be downloaded again), then click « Critiquer ». Versions can be renamed, downloaded and deleted. If you apply in several fields, create one profile per specialty (« Nouveau profil ») and pick the CV each offer uses on its page; the default profile is used otherwise. « Mon compte » (user menu) lets you export or delete your data.

   **Créer mon CV** (on the same page): build a structured CV from a version or from a short interview with Claude, pick a template, accept or reject Claude's suggested edits, download the PDF, and « Enregistrer comme version » so the other features use it.

2. **Offres**: paste a job offer. Piston analyzes the fit with your resume, then writes a cover letter you can edit paragraph by paragraph.
3. **Candidatures**: add the offer to the kanban and move it from « À envoyer » to « Terminée ».
4. **Pistes**: get adjacent job titles, job-board keywords and company types to target.

Each user can run 30 generations per rolling 24 hours (`DAILY_GENERATION_LIMIT`).

## Troubleshooting

| Symptom                                         | Fix                                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL is not set`                       | Run the commands from the repository root, where `.env` lives.                                                    |
| `ECONNREFUSED 127.0.0.1:5432`                   | The dev database is not running: `docker compose -f docker-compose.dev.yml up -d`.                                |
| Login works locally but not through your domain | Serve the app over HTTPS: the session cookie is `secure` in production.                                           |
| « La clé API Claude du serveur est invalide »   | Check `ANTHROPIC_API_KEY` in `.env`, then restart (`docker compose up -d`).                                       |
| The CV preview stays empty                      | The browser could not load pdf.js (old browser or blocked script): download the PDF instead, it is the same file. |
| PDF import says the file looks like an image    | The PDF is a scan without a text layer: paste the text instead.                                                   |
