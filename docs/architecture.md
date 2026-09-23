# Architecture

This describes only what is implemented in the code today.

## Layers

Routes and controllers are thin HTTP adapters: they parse and validate the request, call a service method, and translate the result to a status code and JSON body. All business logic, including cache orchestration and evaluation precedence, lives in the service layer (`flagService`, `overrideService`, `evaluationService`). Repositories are the only layer that calls Prisma. A composition root (`src/container.ts`) wires one shared cache instance and the real repositories into each service factory for the running app; tests construct their own isolated instances instead.

## Evaluation precedence

Evaluating a flag for a user checks for a per-user override first. If one exists, its value wins regardless of the flag's global default, even if the override disables a flag that is enabled by default. If no override exists, the flag's global `defaultEnabled` value is used instead. A flag that does not exist returns 404, which is distinct from a flag that exists but has no override for that user, which returns 200 with `reason: "global"`.

## Read path: evaluate

```mermaid
sequenceDiagram
    participant Client
    participant Router as Express Router
    participant Controller as flagController
    participant Service as evaluationService
    participant Cache as FlagCache
    participant Repo as flagRepository
    participant DB as Postgres

    Client->>Router: GET /api/flags/:key/evaluate?user_id=...
    Router->>Controller: evaluate(key, user_id)
    Controller->>Service: evaluate(flagKey, userId)
    Service->>Cache: getCachedEval(flagKey, userId)

    alt cache hit
        Cache-->>Service: cached {enabled, reason}
    else cache miss
        Note over Service: concurrent misses for the same flag<br/>and user are coalesced (singleflight),<br/>so N simultaneous callers cause one read
        Service->>Cache: getEpoch(flagKey)
        Cache-->>Service: epoch captured before the read
        Service->>Repo: findForEvaluation(flagKey, userId)
        Repo->>DB: SELECT flag, override for userId
        DB-->>Repo: flag row (or null) with matching override
        Repo-->>Service: flag or null
        alt flag not found
            Service-->>Controller: throws NotFoundError
            Controller-->>Client: 404
        else flag found
            Service->>Service: resolve precedence (override wins, else defaultEnabled)
            Service->>Cache: getEpoch(flagKey) again
            alt epoch unchanged since it was captured
                Service->>Cache: setCachedEval(flagKey, userId, result)
            else epoch changed (a write landed mid read)
                Note over Service: result is still returned to this caller,<br/>but is not cached
            end
        end
    end

    Service-->>Controller: {flag, user_id, enabled, reason}
    Controller-->>Client: 200 JSON
```

## Write path: invalidation after commit

Shown for `PATCH /api/flags/:key`. `DELETE /api/flags/:key` follows the same shape and also calls `invalidateFlag`. `PUT` and `DELETE` on `/api/flags/:key/users/:userId` call `invalidateEval` instead, which evicts only that one user's cached entry for the flag rather than every user.

```mermaid
sequenceDiagram
    participant Client
    participant Router as Express Router
    participant Controller as flagController
    participant Service as flagService
    participant Repo as flagRepository
    participant DB as Postgres
    participant Cache as FlagCache

    Client->>Router: PATCH /api/flags/:key
    Router->>Controller: update(key, body)
    Controller->>Service: updateFlag(key, input)
    Service->>Repo: updateFlag(key, input)
    Repo->>DB: UPDATE feature_flags SET ...
    DB-->>Repo: updated row
    Repo-->>Service: updated flag
    Service->>Cache: invalidateFlag(key)
    Note over Cache: bumps the flag's epoch so any read<br/>already in flight will not be cached,<br/>then evicts every cached user for this flag
    Service-->>Controller: updated flag
    Controller-->>Client: 200 JSON
```
