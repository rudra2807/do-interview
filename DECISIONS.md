# Architecture & Spec Decisions

A running log of the meaningful design/architecture decisions made on this project, with brief rationale. Routine implementation steps aren't logged here, only genuine forks where more than one reasonable approach existed.

- **DB access via Prisma**, not raw `pg` or a query builder like Knex. Schema-first, type-safe client, built-in migrations: fastest path to correct CRUD + evaluation logic with the least boilerplate.

- **Assume an external/self-managed Postgres instance**, no `docker-compose.yml` committed. The app only ever consumes a `DATABASE_URL`; local dev points it at whatever Postgres the developer runs themselves. CI provisions its own throwaway Postgres via a `services:` block directly in the GitHub Actions workflow, so this doesn't block automated testing.

- **Per-user overrides are in scope**, not an addition beyond spec: the assignment explicitly requires enabling/disabling "for a specific user," distinct from the global default. Override always wins over the global default when one exists.

- **Folder structure: strict layering.** Routes/controllers are thin HTTP adapters only; all business logic lives in a services layer; repositories are the only layer that talks to Prisma; validation schemas (zod) are kept separate from the Prisma persistence schema.

- **Hard delete for flags** (cascades to overrides), not soft-delete/archive. No audit-history or evaluation-log requirement exists in the spec, so this avoids unrequested scope; noted as a stated tradeoff in the README rather than a gap.

- **Deployment target: DigitalOcean App Platform**, deployed early (before the rest of the feature work) specifically to validate the build, health-check, and rollout pipeline while the app was still just the scaffold plus `/health`, so deployment issues surface before there's a larger surface area to debug.

- **Database on App Platform: the Dev Database tier**, not a standalone Managed Database cluster. Cheaper and faster to stand up for what is currently a scaffold; upgradeable later to a full Managed Database with no app code change, since the app only ever sees a `DATABASE_URL`.

- **App Platform config as code**: the app is defined by a committed `.do/app.yaml` and created via `doctl apps create --spec .do/app.yaml`, not clicked together in the DO web console. Reviewable and reproducible, consistent with the project's "production-ready" bar.

- **Pinned Prisma to 6.19.3, not the `latest`-tagged 8.0.0-rc.15.** `npm install prisma@latest` currently resolves to a release candidate (DigitalOcean's registry has it tagged `latest` ahead of a stable release), and Prisma 7 made a breaking change removing `datasource.url` from `schema.prisma` in favor of a separate `prisma.config.ts` plus driver adapter. That's meaningful extra complexity/novelty for a take-home a reviewer will read, so we use the latest *stable* line (6.x) with the conventional schema-url and `migrate dev` workflow instead.

- **Evaluate endpoint contract fixed to a specific shape**: query param `user_id` (not `userId`), response `{flag, user_id, enabled, reason}` with `reason` one of `"user_override" | "global"`. This was specified directly rather than left to design; other endpoints built before this contract existed (the override PUT/DELETE responses) were later unified to the same snake_case convention for `user_id` and `updated_at` to avoid a client-facing inconsistency, but the base flag resource shape (create/list/patch responses) stays camelCase, mirroring the Prisma model directly. Unifying that too would be a larger, unrelated change to already-tested endpoints, not something this decision covers.

- **All request schemas use zod's `.strict()`**, rejecting unknown/misspelled fields with 400 instead of silently stripping them. Found via testing that a typo like `defaultEnable` instead of `defaultEnabled` was silently ignored, creating a flag with the wrong default and no error at all. Strict rejection trades some forward-compatibility (a client sending extra metadata fields would now get a 400) for catching this class of client bug immediately.

- **Override create-vs-update status (201 vs 200) is determined by attempting `create()` first and falling back to `update()` only on a real Prisma P2002**, not by comparing the row's `createdAt`/`updatedAt` timestamps. The timestamp approach was tried first and proven unreliable under true concurrency: two requests issued in the same millisecond can both see equal timestamps on the same row (Prisma computes them client-side per call), which could tell the loser of a race it had created a row it only updated. The create-then-fallback approach is deterministic because it relies on Postgres's unique constraint, not on timing.
