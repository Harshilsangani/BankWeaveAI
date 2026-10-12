<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project maintenance

- Read `README.md` and `docs/roadmap.md` for current setup, implementation and pending GCP work. Keep durable documentation under `docs/`; update existing files instead of adding per-task completion logs.
- Preserve the working `backend/storage/` databases, checkpoints, original customer IDs and saved chats. Do not reset/reseed existing data or modify applied checksummed migrations.
- Preserve legacy `RISKLENS_*` configuration, `x-risklens-*` headers and actor/session/storage identifiers. The old customer-operator identifier is an Analyst compatibility alias.
- Application APIs use the FastAPI backend. Reference mocks belong in `tests/fixtures/`, never production routes. Generated test artifacts stay ignored.
