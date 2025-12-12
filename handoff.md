# Handoff
## Current State (2025-12-12)
- Reviewed `AGENTS.md` and `CLAUDE.md` to lock in Amiga-focused rules, no-background-process policy, and deployment expectations.
- Read the Render deployment guide (`Documentation/7-Reference Sources/reference/RENDER_DEPLOYMENT.md`), deployment scripts guide (`Documentation/7-Reference Sources/reference/DEPLOYMENT_SCRIPTS.md`), Docker deployment plan (`DOCKER_DEPLOYMENT_PLAN.md`), and Claude’s recent migration brief (`Documentation/2-Sysops/RENDER_DOCKER_MIGRATION.md`).
- Render blueprint still needs to be created, but GitHub secrets are configured and the SDK build now ships its own `socket.io` type declarations so the Docker `sdk-builder` stage can succeed.

## Recent Work
- Captured the Claude-authored Render/Docker checklist, added the Render credentials, and taught the SDK to resolve its `socket.io` types (`sdk/types/socket.io.d.ts` plus the broader `typeRoots` change to `sdk/tsconfig.json`).
- Added `@amiexpress/bbs-door-sdk` as a file dependency of the backend so doors can require the SDK, then ran `npm install` in `web/backend` to build the frontend/config app/SDK preview (the same scripts the Docker image runs).

## Next Steps
1. Create the `amiexpress-bbs` Blueprint Docker service on Render (per `RENDER_DOCKER_MIGRATION` steps) and confirm stage 4 (SDK build) runs cleanly.
2. Monitor the new service’s build logs and health checks, verify `/`, `/admin/`, and `/sdk/`, and ensure `/logs/backend.log` reports “Server running on port 3001.”
3. Once the Docker service is confirmed healthy, retire the legacy frontend/backend services via the Render dashboard cleanup steps.
