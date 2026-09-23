# do-interview

[![CI](https://github.com/rudra2807/do-interview/actions/workflows/ci.yml/badge.svg)](https://github.com/rudra2807/do-interview/actions/workflows/ci.yml)

A feature flag service. It stores flags with a name, description, and a global default state, supports enabling or disabling a flag for a specific user separately from that global default, and exposes a cached endpoint to evaluate whether a flag is enabled for a given user.

Live instance: https://do-interview-ido8t.ondigitalocean.app

See [docs/architecture.md](docs/architecture.md) for the request lifecycle and data flow.

## Setup

Requires Node 20 (see `.nvmrc`) and a local Postgres instance.

```
psql -h localhost -U postgres -c "CREATE DATABASE feature_flags;"
cp .env.example .env
# edit .env if your local Postgres user, password, or port differ from the example
npx prisma migrate deploy
npm run dev
```

The server listens on the port in `.env` (default 3000).

## Testing

Tests run against a separate database, never the one used for `npm run dev`.

```
psql -h localhost -U postgres -c "CREATE DATABASE flags_test;"
# .env.test already points DATABASE_URL at flags_test; edit it if your local Postgres user or password differ
npm test
```

A global test guard (`tests/globalSetup.ts`) refuses to run any test unless `DATABASE_URL` contains `flags_test`, so the suite (which performs real deletes) cannot accidentally run against the dev database.

## Endpoints

| Method | Path | Description | Success | Errors |
|---|---|---|---|---|
| GET | `/health` | Liveness check | 200 | |
| POST | `/api/flags` | Create a flag | 201 | 400, 409 |
| GET | `/api/flags` | List all flags | 200 | |
| PATCH | `/api/flags/:key` | Update `description` and/or `defaultEnabled` | 200 | 400, 404 |
| DELETE | `/api/flags/:key` | Delete a flag, cascading its overrides | 204 | 404 |
| PUT | `/api/flags/:key/users/:userId` | Set a per-user override | 201 (created) or 200 (updated) | 400, 404 |
| DELETE | `/api/flags/:key/users/:userId` | Remove a per-user override | 204 | 404 |
| GET | `/api/flags/:key/evaluate?user_id=...` | Evaluate a flag for a user | 200 | 400, 404 |

## curl examples

Create a flag:
```
curl -X POST http://localhost:3000/api/flags \
  -H "Content-Type: application/json" \
  -d '{"key":"checkout-redesign","name":"Checkout Redesign","defaultEnabled":false}'
```

Set a per-user override:
```
curl -X PUT http://localhost:3000/api/flags/checkout-redesign/users/user-123 \
  -H "Content-Type: application/json" \
  -d '{"enabled":true}'
```

Evaluate for a user:
```
curl "http://localhost:3000/api/flags/checkout-redesign/evaluate?user_id=user-123"
```

## CI

On every push to main and every pull request, GitHub Actions runs the full check: install, generate the Prisma client, apply migrations against a throwaway postgres:16 service container, typecheck, run the test suite, and build. No lint step exists yet since there is no ESLint config in the repo, and there is no deploy job or seed step. See `.github/workflows/ci.yml`.

## Known limitations and next steps

- No authentication. Every endpoint is open. A production version would use hashed API keys with separate admin and evaluator scopes, plus rate limiting.
- The evaluation cache is in-process, per instance. With more than one instance, a write on one instance cannot evict another instance's cache, so staleness across instances is bounded only by the cache's TTL, not by invalidation. A production answer would be Redis or a pub/sub based invalidation broadcast.
- Concurrent cold reads for the same flag and user are coalesced in-process (singleflight), so this is not currently a gap, but it only helps within a single instance for the same reason as above.
- Flag deletion is a hard delete with no recovery path and no audit log.
- The Dev Database tier has no standby and limited backups.
- `userId` has no length or charset validation at the API layer. The cache itself is safe regardless of what it contains (see the decision log), but nothing stops an arbitrarily long or oddly formatted value from reaching the database.
- `GET /api/flags` is unpaginated. It returns every flag in one response.
- No linter is configured.
- The PRE_DEPLOY migration job exists in `.do/app.yaml` and has been verified against a real deployment: `prisma migrate deploy` ran there and applied the schema to the production Dev Database.
