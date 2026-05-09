# Docker Migration Phase 1 (Safe, Incremental)

This phase introduces Docker Compose for these services only:

- statuspage
- team
- linkshortener
- filehoster
- zitatboard

The current PM2 stack remains untouched until each service is explicitly cut over.

## Safety principles

1. PM2 stays active until per-service cutover is validated.
2. Docker services bind to loopback only (`127.0.0.1`) to avoid public exposure.
3. Docker services use alternative host ports in Phase 1 (`3110-3114`) to avoid conflicts with PM2 (`3010-3014`).
4. Nginx domains remain compatible via upstream switch (per service).
5. Persistent service state is stored in Docker named volumes.

## Files added in this phase

- `docker-compose.yml` (in `fahrstuhl` repo root)
- `statuspage/Dockerfile`
- `statuspage/.dockerignore`
- `team/Dockerfile`
- `team/.dockerignore`
- `linkshortener/Dockerfile`
- `linkshortener/.dockerignore`
- `filehoster/Dockerfile`
- `filehoster/.dockerignore`
- `zitat-board/Dockerfile`
- `zitat-board/.dockerignore`

## Compose startup

```bash
cd /home/marvin/fahrstuhl
docker compose build
docker compose up -d
docker compose ps
```

## Data persistence mapping

- `statuspage_data` -> `/app/data`
- `linkshortener_data` -> `/app/data`
- `filehoster_data` -> `/app/data`
- `filehoster_uploads` -> `/app/uploads`
- `zitatboard_data` -> `/app/data`

## Environment compatibility

- Each container supports existing `.env` files via `env_file` (optional).
- Existing variable names are preserved (no renaming required).
- If a service currently works under PM2 with `.env`, the same values can be reused for Docker.

## Port strategy in Phase 1

- PM2 stays on existing ports (`3010-3014`).
- Docker containers use loopback ports:
  - linkshortener: `127.0.0.1:3110`
  - filehoster: `127.0.0.1:3111`
  - statuspage: `127.0.0.1:3112`
  - zitatboard: `127.0.0.1:3113`
  - team: `127.0.0.1:3114`

## Per-service cutover (recommended)

Example for `linkshortener`:

1. Keep PM2 running and verify Docker shadow instance:

```bash
curl -sSf http://127.0.0.1:3110/health
docker compose logs --tail=100 linkshortener
```

2. Update Nginx upstream for this domain from `127.0.0.1:3010` to `127.0.0.1:3110`.

3. Reload Nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

4. Validate production domain.

5. Only after validation, stop PM2 service for that app:

```bash
pm2 stop linkshortener
pm2 save
```

Repeat for `filehoster`, `zitatboard`, `team`, `statuspage`.

## Test commands

```bash
# Container health endpoints
curl -sSf http://127.0.0.1:3110/health
curl -sSf http://127.0.0.1:3111/health
curl -sSf http://127.0.0.1:3112/health
curl -sSf http://127.0.0.1:3113/health
curl -sSf http://127.0.0.1:3114/health

# Docker status
docker compose ps
docker compose logs --tail=200
```

## Rollback commands (per service)

If a cutover fails:

1. Point Nginx upstream back to PM2 port (`301x`).
2. Reload Nginx.
3. Start PM2 service if needed.
4. Stop Docker service for that app.

Example (`linkshortener`):

```bash
# after restoring nginx upstream back to 127.0.0.1:3010
sudo nginx -t && sudo systemctl reload nginx

pm2 start linkshortener
pm2 save

docker compose stop linkshortener
docker compose logs --tail=100 linkshortener
```

## Full Phase 1 rollback

```bash
# Ensure nginx upstreams are back to PM2 301x ports first
sudo nginx -t && sudo systemctl reload nginx

pm2 start linkshortener filehoster statuspage zitatboard team
pm2 save

cd /home/marvin/fahrstuhl
docker compose down
```

## Notes

- This phase intentionally does not include `fahrstuhl`, `dashboard-php`, `deploy-webhook`, `eseltokens-webhook`, `backup-worker`, `musikbot`, `lavalink`, `redis`, or `mariadb`.
- Their migration should happen in later phases after Phase 1 is stable under real traffic.
