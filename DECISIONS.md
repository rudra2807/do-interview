# Architecture & Spec Decisions

A running log of the meaningful design/architecture decisions made on this project, with brief rationale. Routine implementation steps aren't logged here — only genuine forks where more than one reasonable approach existed.

- **DB access via Prisma**, not raw `pg` or a query builder like Knex. Schema-first, type-safe client, built-in migrations — fastest path to correct CRUD + evaluation logic with the least boilerplate.

- **Assume an external/self-managed Postgres instance**, no `docker-compose.yml` committed. The app only ever consumes a `DATABASE_URL`; local dev points it at whatever Postgres the developer runs themselves. CI provisions its own throwaway Postgres via a `services:` block directly in the GitHub Actions workflow, so this doesn't block automated testing.

- **Cache invalidation: write-through + a 30s TTL backstop**, with a precise per-flag secondary index (`Map<flagKey, Set<userId>>`) rather than wiping the entire cache on any write. A flag-level write only evicts that flag's cached evaluations; other flags' cached results are untouched.

- **Per-user overrides are in scope**, not an addition beyond spec: the assignment explicitly requires enabling/disabling "for a specific user," distinct from the global default. Override always wins over the global default when one exists.

- **Folder structure: strict layering** — routes/controllers are thin HTTP adapters only; all business logic lives in a services layer; repositories are the only layer that talks to Prisma; validation schemas (zod) are kept separate from the Prisma persistence schema.

- **Hard delete for flags** (cascades to overrides), not soft-delete/archive. No audit-history or evaluation-log requirement exists in the spec, so this avoids unrequested scope; noted as a stated tradeoff in the README rather than a gap.

- **Deployment target: DigitalOcean App Platform**, deployed early (before the rest of the feature work) specifically to validate the build → health-check → rollout pipeline while the app was still just the scaffold + `/health`, so deployment issues surface before there's a larger surface area to debug.

- **Database on App Platform: the Dev Database tier**, not a standalone Managed Database cluster. Cheaper and faster to stand up for what is currently a scaffold; upgradeable later to a full Managed Database with no app code change, since the app only ever sees a `DATABASE_URL`.

- **App Platform config as code**: the app is defined by a committed `.do/app.yaml` and created via `doctl apps create --spec .do/app.yaml`, not clicked together in the DO web console — reviewable and reproducible, consistent with the project's "production-ready" bar.

- **Pinned Prisma to 6.19.3, not the `latest`-tagged 8.0.0-rc.15.** `npm install prisma@latest` currently resolves to a release candidate (DigitalOcean's registry has it tagged `latest` ahead of a stable release), and Prisma 7 made a breaking change removing `datasource.url` from `schema.prisma` in favor of a separate `prisma.config.ts` + driver adapter. That's meaningful extra complexity/novelty for a take-home a reviewer will read, so we use the latest *stable* line (6.x) with the conventional schema-url + `migrate dev` workflow instead.
