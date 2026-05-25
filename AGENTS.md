# AGENTS.md

Development rules for AI agents and human contributors.
Read this file before starting any task in this repository.

## Project Overview

This is a Bun monorepo for a Telegram Mini App backed by Amnezia-Web-Panel.

- `server` is a stateless Bun/Hono service. It serves the built SPA, exposes JSON API routes, starts a grammY bot,
  validates Telegram Mini App auth, issues JWT sessions, and proxies panel operations.
- `client` is a React/Vite SPA for Telegram Mini Apps. It uses Tailwind, `react-router-dom`, `i18next`, and Zod-based
  API response parsing.
- Root scripts orchestrate both workspaces.

## Code Rules

- Keep new and touched source files at or below 300 lines. Split files when they grow beyond that.
- Use one React component per file when the component is reusable or page-level.
- Use `kebab-case` for file names.
- Do not use `any`; keep TypeScript strict and explicit.
- Validate all external input with Zod.
- Server API handlers must return `ActionResult<T>`-shaped JSON via `ok(...)` or `err(...)`.
- Keep changes scoped to the task. Do not refactor unrelated code.
- Do not revert or overwrite changes made by other agents or users.

## Existing Patterns

- API response shape lives in `server/src/action-result.ts`.
- Server routers are module factories named `create*Router(...)` and are mounted from `server/src/index.ts`.
- Protected API routes use `authMiddleware(env)` and read the current session through `getSession(c)`.
- Request bodies are parsed with `await c.req.json().catch(() => null)` and then `Schema.safeParse(...)`.
- Environment variables are validated once through `loadEnv()` in `server/src/env.ts`.
- The panel integration is isolated in `server/src/panel/client.ts`; keep upstream parsing and caching there.
- Client API calls go through `client/src/api/client.ts`; response data must be parsed by schemas from
  `client/src/api/types.ts`.
- UI pages receive shared app state through `AppContext` from `client/src/app.tsx`.
- Localized user-facing text should go through `client/src/i18n/locales/*.json` unless the existing screen is a
  development-only demo.
- Tests are colocated with implementation files as `*.test.ts`.

## Task Workflow

1. Clarify the requirements and identify unclear or risky points.
2. If a decision depends on current ecosystem guidance or best practice, research it and ask the user before choosing.
3. Split the work into subtasks and decide whether any can safely run in parallel through subagents.
4. Write a concise task brief for each subagent you start.
5. Implement the change locally or integrate subagent output.
6. Run the required checks.
7. Run a subagent review before handing the result back to the user.

## Required Checks

Run these before reporting completion:

```bash
bun run format
bun run check
bun run typecheck
bun run test
```

Notes:

- `bun run typecheck` checks both workspace TypeScript projects explicitly.
- Plain `bunx tsc --noEmit` is not valid here because the repository has no root `tsconfig.json`.
- If a required check cannot run, report the exact command and failure reason.
- Do not claim success for checks that were skipped or failed.

## Frontend Guidelines

- Follow the existing Telegram Mini App visual language and CSS variables.
- Keep components small and predictable; page-level composition belongs in `client/src/pages`.
- Prefer existing components from `client/src/components` before adding new UI primitives.
- Keep all API state transitions explicit: loading, error, empty, and success states should be handled.
- Validate server responses before rendering them.

## Backend Guidelines

- Keep Hono route modules focused by resource.
- Use explicit HTTP status codes with stable error codes.
- Keep Amnezia-Web-Panel-specific behavior inside the panel client or small server utilities.
- Invalidate panel caches after mutations.
- Avoid adding persistent state unless the task explicitly requires it; the service is intended to stay stateless.
