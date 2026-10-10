# Single-server deployment (Docker Compose)

Runs the full system on one machine: a PostgreSQL container, the FastAPI
backend, the built frontend served by nginx, and Caddy as the public HTTPS
entrypoint. Two modes are supported:

- **Local (default)** — Docker Desktop on Windows (WSL2), plain HTTP on
  `localhost`, secrets read from `deploy/.env`.
- **Production** — a Linux VPS, Caddy terminating TLS for the domain,
  secrets read from a directory outside the app payload.

## Architecture

Production (Caddy is the only public entrypoint; nothing else publishes a port):

```
Browser ──HTTPS──► Cloudflare ──► Caddy (host :80, :443)
                                        │
                                        ▼
                                     nginx (frontend:80, internal)
                                       ├── /assets + SPA fallback ──► static build
                                       └── /api, /advisers, ... ──► backend (internal :8000)
                                                                    │
                                              PostgreSQL (db:5432, internal)
                                              Google Cloud Storage + Vertex AI
                                              Clerk (JWT verification)
```

Local development (no Caddy, frontend published directly):

```
Browser ──► nginx (host :80)
              ├── /assets + SPA fallback ──► static build (inside nginx)
              └── /api, /advisers, /students, /users, ... ──► backend (host :8000)
```

Because the frontend is built with `VITE_API_BASE_URL=""`, the browser calls
the same origin it loaded from and nginx forwards API routes to the backend.
No CORS issues and no URL baked into the build.

## Files

| File | Purpose |
|---|---|
| `backend.Dockerfile` | Python 3.13 backend image |
| `entrypoint.sh` | Wait for db → `alembic upgrade head` → run uvicorn |
| `frontend.Dockerfile` | Build the Vite app, then serve it with nginx |
| `nginx.conf` | Static files + SPA fallback + API proxy to backend |
| `Caddyfile` | Production only: `ccs-edms.bid` → `frontend:80`, automatic HTTPS |
| `docker-compose.yml` | db + backend + frontend + caddy services |
| `env.example` | Template for `.env` (real values go in the ignored `.env`) |
| `gcp-credentials/` | Put your service-account JSON here (gitignored, never commit) |

## Configuration variables

Two optional variables let the same compose file run locally and on the server:

| Variable | Default (local) | Production value |
|---|---|---|
| `ENV_FILE` | `./.env` | `../../secrets/.env` |
| `SA_HOST_PATH` | `./gcp-credentials/vertex-ai-service-account.json` | `../../secrets/vertex-ai-service-account.json` |

`ENV_FILE` is the compose `env_file` path; `SA_HOST_PATH` is the host path
bind-mounted read-only into the backend at `/app/gcp-credentials.json`. Both are
resolved **relative to this `deploy/` directory**, since that is the compose
project directory. On the server they point outside the app payload so real
secrets never travel with the repository.

## Prerequisites (one-time)

1. **Docker** installed and running — Docker Desktop (local) or
   `curl -fsSL https://get.docker.com | sh` (VPS).
2. **GCS permission** so the app can set bucket CORS at startup (it also needs
   object access). Run once in Google Cloud Shell:

   ```bash
   gcloud storage buckets add-iam-policy-binding \
     gs://enrolment-documents-weighty-rookery-t3bf2-asia-southeast1 \
     --member=serviceAccount:enrolment-docs-app@weighty-rookery-t3bf2.iam.gserviceaccount.com \
     --role=roles/storage.admin

   gcloud projects add-iam-policy-binding weighty-rookery-t3bf2 \
     --member=serviceAccount:enrolment-docs-app@weighty-rookery-t3bf2.iam.gserviceaccount.com \
     --role=roles/aiplatform.user
   ```

   Check: `gcloud storage buckets get-iam-policy gs://<bucket>` shows the
   binding, and the backend startup log no longer shows the `403 ... Failed to
   configure GCS bucket CORS` warning.

3. **Clerk Production instance** (dev instances reject non-localhost origins):
   - Dashboard → **API Keys** → copy `sk_prod_...` and `pk_prod_...`.
   - Dashboard → **Credentials → Public Keys** → copy the JWKS PEM into
     `CLERK_JWT_KEY`.
   - Set the **Application domain** to your production domain and add
     `https://<your-domain>` to **Allowed origins** (keep the localhost
     entries for local dev).

## Local setup

1. **Copy the template and fill it in:**

   ```bash
   # in the deploy/ folder
   cp env.example .env
   ```

   Edit `.env`:
   - `DATABASE_URL` defaults to the `db` service — leave it unless you changed
     the DB credentials.
   - `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_AUTHORIZED_PARTIES`.
   - `VITE_CLERK_PUBLISHABLE_KEY` (leave `VITE_API_BASE_URL` empty).
   - `CORS_ORIGINS` and `GCS_CORS_ORIGINS` → `http://localhost`.
   - Confirm `GOOGLE_CLOUD_PROJECT`, `GCS_BUCKET`, `VERTEX_AI_MODEL` match
     `backend/.env`.

2. **Provide the service-account JSON:**

   ```bash
   # from Windows Explorer, copy your SA JSON here:
   #   deploy/gcp-credentials/vertex-ai-service-account.json
   ```

3. **Drive Docker.**

   Docker Desktop's CLI needs its `resources\bin` folder on the *Windows* PATH
   to resolve the credential helper on registry pulls. Run the compose commands
   through `cmd.exe` with that folder prepended (change the path if you
   installed Docker Desktop elsewhere):

   ```cmd
   cd /d C:\Users\ceedj\OneDrive\Desktop\Reactjs + Vite\react-vite
   set PATH=C:\Users\ceedj\AppData\Local\Programs\DockerDesktop\resources\bin;%PATH%
   ```

   From then on in that same window:

   ```cmd
   docker compose -f deploy\docker-compose.yml -f deploy\docker-compose.local.yml up -d --build
   ```

   (PowerShell equivalent: `$env:PATH="...\resources\bin;$env:PATH"`.)

4. **Build and start:**

   ```cmd
   docker compose -f deploy\docker-compose.yml -f deploy\docker-compose.local.yml up -d --build
   ```

   `docker-compose.local.yml` publishes the backend and frontend ports for
   local work. It is never used in production, where Caddy is the only public
   entrypoint.

   First build takes a few minutes (pip + `npm ci`). It is safe to rerun;
   subsequent starts use cached layers.

## Verify

```cmd
curl http://localhost:8000/            :: {"message":"FastAPI server is running."}
docker compose -f deploy\docker-compose.yml ps
```

Check the backend migrated cleanly on first start:

```cmd
docker compose -f deploy\docker-compose.yml logs backend    :: look for "Running database migrations" then "Application startup complete"
```

Sign in at `http://localhost`, then exercise the upload flow once — the most
common failure point is bucket CORS, which happens automatically because of the
storage.admin grant.

## Production deployment (Linux VPS)

Target layout — the app payload holds no secrets; credentials live one level
above it and are referenced by a tiny non-secret pointer file:

```
/opt/enrollment/
├── app/                     ← repository (rsync'd, secrets excluded)
│   └── deploy/
│       ├── .env             ← ONLY ENV_FILE + SA_HOST_PATH (no secrets)
│       └── docker-compose.yml
└── secrets/                 ← chmod 600
    ├── .env                 ← real secrets (Clerk keys, DB password, origins)
    └── vertex-ai-service-account.json
```

`deploy/.env` and `deploy/gcp-credentials/` are gitignored **and** excluded from
the transfer, so real credentials never enter the app directory.

### 1. Prepare the server

```bash
ssh root@<server-ip>          # confirm access BEFORE changing anything
passwd                        # rotate the default password
apt update && apt upgrade -y

fallocate -l 2G /swapfile     # 1 GB RAM is tight for the frontend build
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Allow SSH before enabling, so the firewall cannot lock you out
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
```

Only 22/80/443 are open. Postgres and the backend publish no host ports.

### 2. Transfer — app first, secrets separately

```bash
# from the repo root (WSL)
rsync -az --exclude 'deploy/.env' --exclude 'deploy/gcp-credentials' \
  ./ root@<server-ip>:/opt/enrollment/app/

scp deploy/.env \
    deploy/gcp-credentials/vertex-ai-service-account.json \
    root@<server-ip>:/opt/enrollment/secrets/
```

### 3. Point compose at the secrets

```bash
ssh root@<server-ip>
chmod 600 /opt/enrollment/secrets/.env \
          /opt/enrollment/secrets/vertex-ai-service-account.json

cat > /opt/enrollment/app/deploy/.env <<'EOF'
ENV_FILE=../../secrets/.env
SA_HOST_PATH=../../secrets/vertex-ai-service-account.json
EOF
```

### 4. Validate, build, start

```bash
cd /opt/enrollment/app/deploy
docker compose config -q      # validate WITHOUT printing secret values
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 backend
```

Use `config -q`, never plain `config`: the latter expands `env_file` and prints
your Clerk secret key and database password to the terminal.

### 5. DNS and TLS

Point an `A` record for your domain at the server IP with **DNS only** (grey
cloud) so Caddy can complete the ACME challenge. Caddy then obtains and renews
the certificate automatically. Keep the proxy off until TLS is confirmed; the
proxy can be enabled afterwards once the origin serves valid HTTPS.

Cloudflare's proxy also cannot issue a certificate for a bare apex with no
origin cert when the origin is unreachable, so keep DNS-only during setup.

### 6. Verify

```bash
curl -I https://<your-domain>                  :: HTTP/2 200
docker compose ps                             :: 4 services up
docker compose logs backend | grep startup    :: "Application startup complete"
```

Register the admin/adviser/student accounts on the production Clerk instance —
cloning an instance copies settings, **not** users. Then exercise one upload to
confirm the GCS + Vertex AI path.

## Day-to-day

Locally (from the repo root, in the `%PATH%`-augmented window):

```cmd
docker compose -f deploy\docker-compose.yml -f deploy\docker-compose.local.yml ps
docker compose -f deploy\docker-compose.yml -f deploy\docker-compose.local.yml logs -f backend
docker compose -f deploy\docker-compose.yml -f deploy\docker-compose.local.yml up -d --build
docker compose -f deploy\docker-compose.yml -f deploy\docker-compose.local.yml down
docker compose -f deploy\docker-compose.yml -f deploy\docker-compose.local.yml down -v
```

On the server (from `/opt/enrollment/app/deploy`, single file — no local
override, so only Caddy is public):

```bash
docker compose ps
docker compose logs -f backend
docker compose up -d --build
docker compose down          # stop (data persists)
docker compose down -v       # stop AND wipe the Postgres volume
```

Postgres data lives in the `eddms_pgdata` named volume and survives restarts.
`down -v` deletes it — there is no going back.

### Redeploying after code changes

```bash
rsync -az --exclude 'deploy/.env' --exclude 'deploy/gcp-credentials' \
  ./ root@<server-ip>:/opt/enrollment/app/
ssh root@<server-ip>
cd /opt/enrollment/app/deploy && docker compose up -d --build
```

The excludes keep the local secrets out of the payload. The server-side
`deploy/.env` pointer file is untouched by rsync, and `--delete` is deliberately
omitted so it cannot be removed by a transfer.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `403` GCS CORS warning at backend startup | `roles/storage.admin` not granted on the bucket — run the gcloud command above |
| Signed-URL upload fails from the browser | `GCS_CORS_ORIGINS` doesn't match the exact origin (scheme+host+port) |
| Login returns 401 | Clerk instance still Development, or origin missing from Allowed origins |
| `docker: command not found` / `docker-credential-desktop: executable file not found` | Run Docker CLI from `%PATH%`-augmented `cmd.exe` (see *Drive Docker* above), or enable WSL integration in Docker Desktop |
| Backend can't reach Postgres | Wait for `db` healthy (`docker.exe compose ps`); `DATABASE_URL` must point at `db:5432` |
| Port 80 in use (local) | Uncomment the frontend `ports` mapping in `docker-compose.yml` (`"8080:80"`); in production Caddy owns port 80, so check nothing else is bound |
| `env_file` not found on the server | `ENV_FILE` in `deploy/.env` must be relative to the `deploy/` directory — from `/opt/enrollment/app/deploy` it is `../../secrets/.env` |
| Caddy can't get a certificate | A record must be DNS-only and resolving to the server; confirm `dig` and that ports 80/443 are open in `ufw` |
| Upload 403 or `AccessDenied` | The mounted credential is wrong: check `SA_HOST_PATH` and that the JSON's `client_email` is the service account holding the bucket grants |