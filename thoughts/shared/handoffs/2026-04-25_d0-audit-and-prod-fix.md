---
date: 2026-04-25
topic: dos.library D0 audit, BBSApi game-mode refactor, live-site livechat fix
tags: [amiga-emulation, dos.library, lvo, bbsapi, game-mode, docker, livechat, ctop, aquascan]
status: implemented
---

# D0 audit + game-mode refactor + live-site fix (2026-04-25 evening)

## What was shipped today

### Commit `ace9e2451` — `fix(amiga-emulation): propagate D0 across dos.library LVO dispatcher`
DosLibrary.handleCall was discarding the helper return value for several LVOs whose helpers DO return a D0 value. Per the AmigaOS dos.library autodocs, these five all must return D0:

| LVO | Function | What goes in D0 |
|---|---|---|
| -54 | `Input` | stdin BPTR |
| -60 | `Output` | stdout BPTR |
| -66 | `Seek` | previous file position (or -1 on error) |
| -132 | `IoErr` | last error code |
| -192 | `DateStamp` | pointer to DateStamp struct (same as input D1) |

Without propagation, D0 retained whatever scratch value the caller had stashed before the JSR — most damagingly `IoErr`, since every door checks D0 immediately after Open/Lock/Read/Write.

The parallel vector-table dispatcher in `dos-vectors.ts` was already correct (the trap framework in `LibraryTraps.ts:1556` writes the handler return into D0). Only the `handleCall` path was broken. Audited the four other libraries with `handleCall` (Exec/Icon/Intuition/AmiExpress) — they use inline `setRegister(0, result)` per case so the bug was unique to DosLibrary.

Regression tests at:
- `web/backend/tests/amiga-emulation/datestamp-d0-return.test.ts`
- `web/backend/tests/amiga-emulation/dos-d0-propagation.test.ts`

Both use a stub MoiraEmulator (no WASM init) and verify D0 propagation directly.

### Commit `42082b096` — `refactor(doors): centralize game-mode helpers, fix BBSApi delegation`
Backend `BBSApi.enableGameMode()/disableGameMode()` only emitted the socket event — they never set `session.gameModeEnabled`, never set `session.currentDoorType`, and disable never tore down `keyRepeatManager` or cleared `keyState`. SDK doors calling `bbs.enableGameMode()` were getting half the canonical helper's behavior.

Helpers now live in `web/backend/src/services/game-mode.service.ts` (type-only deps on `Socket` and `BBSSession` so any consumer can import them without the full socket-dispatch graph). `socket-handlers.ts` re-exports them for backwards compatibility. BBSApi delegates instead of duplicating.

Replaced the manual `socket.emit('game-mode', true)` workaround in the hybrid-RPC code path (`door.handler.ts:1800`) with the proper helper so session state stays in sync there too.

Declared `enableGameMode?(doorType?)` / `disableGameMode?()` on the SDK BBSApi interface (both copies of `types.ts`) so consumers stop relying on duck-typed optional chaining.

Regression test: `web/backend/tests/doors/bbsapi-game-mode.test.ts`.

### Commit `a26f1951f` — `fix(prod): use SDK package name for door-preloader require`
LIVE-SITE BUG. `door.handler.ts:1634` used a source-relative path `'../../../../sdk/utils/door-preloader'` that only resolved in dev. The Docker image ships only `sdk/dist/...` (Dockerfile:164: `COPY --from=sdk-builder /app/sdk/dist ./sdk/dist`) — the source `sdk/utils/...` directory doesn't exist in production. Every PRELOADER=YES door (most visibly `livechat`) crashed on startup.

Fix: switch to `require('@amiexpress/bbs-door-sdk/utils/door-preloader')` and add the matching subpath to `sdk/package.json` exports.

### Test runs
- `npx tsc --noEmit` clean across both commits
- 254 amiga-emulation + bbsapi tests pass
- All 3 commits pushed to `origin/main` → Hetzner deploy in flight

## Priority backlog for next session

### 1. **`DoorManager.ts:777` — dev-only `install-sdk-doors.ts` reference (PROD BUG)**
**Per user request:** "fix DoorManager.ts:777 references dev/scripts/install-sdk-doors.ts (not shipped). Only triggered from the sysop 'rebuild door' admin flow — not user-facing. Worth fixing later but won't crash livechat or any normal door run."

```typescript
// web/backend/src/doors/DoorManager.ts:776-778
const tsNodeProject = path.join(this.projectRoot, 'dev/scripts/tsconfig.json');
const installDoorScript = path.join(this.projectRoot, 'dev/scripts/install-sdk-doors.ts');
const proc = spawn('npx', ['ts-node', '-P', tsNodeProject, installDoorScript, ...]);
```

`dev/` isn't shipped to Docker. When a sysop hits "rebuild door" in the admin UI on the live site, this `spawn` will fail with ENOENT or similar.

**Fix options:**
- (a) Move the door-install logic out of `dev/scripts/` into `web/backend/src/services/` so it ships with prod
- (b) Inline the install logic into `DoorManager.rebuildDoor()` (probably only needs to refresh `Commands/BBSCmd/<door>.info` + reload doors registry — the latter already exists)
- (c) Wrap in a feature flag / try-catch that no-ops in production with a "rebuild requires dev environment" message

Recommend (b) — small, keeps rebuild functional in prod, no shimming. The existing `initializeDoors()` reload pattern from `BBSApi.ts:1346` is the precedent.

### 2. **CS (AquaScan) — DT_CONFACCESS contract mismatch**
Live BBS log proves our DT_CONFACCESS handler matches express.e:3778 exactly (returns `user.conferenceAccess` 10-char "XXXXXXXXX_" style string). But AquaScan v1.0 uses that string as a NAME for `BBS:ACCESS/AREA.<name>.info` icon lookup.

`/Users/spot/Code/amiexpress-web/ACCESS/` contains `AREA.Sysop.info`, `AREA.Elite.info`, `AREA.Lamer.info`, `AREA.Disabled.info` — these are *names*, not access flags. So AquaScan expects an area NAME, not conference flags.

**Two hypotheses:**
- (a) AquaScan v1.0 is from a non-AmiExpress lineage that overloads cmd 146 with different semantics. Need to find the AquaScan source or disassemble.
- (b) There's a separate XIM cmd for "user area name" we should be answering. Check express.e for ACCESS/AREA references.

**Live trace** at `logs/backend.log:7605` documents the failure path — useful as starting point.

### 3. **CTOP — silent failure after IoErr fix**
Conftop v2.3 by Bobo/Mystic (closed source, different from Conftop-II E source under `Documentation/7-Reference Sources/`). Pre-fix: printed "CONFTOP (ERROR): Reset date is out of range." Post-fix: silently exits with no output (door log shows status=ok in 1.21s).

**Findings from this session** (so we don't re-investigate):
- DateStamp returns `days=17646` correctly with the fix
- File header `0x04006920` is **computed at runtime, not a static binary constant** (verified by byte-search of Conftop020.x — zero hits)
- High 16 bits of header is **always `0x0400`** — fixed file-format marker/version
- Low 16 bits decoded as days-since-1978 = **future dates (2047-2051 range)** — matches the SanctuaryBBS reference files (`0x040068ec`, `0x0400629d`)
- So the header **is not garbage** — it's the binary's own encoding for "no auto-reset / reset way in future"
- The pre-fix error message came from a code path triggered by the wrong IoErr value. Post-fix, a different (silent) path runs, but doesn't display the top uploaders that should be in `Conftop.Data`

**Recommend:** either (a) hide CTOP from the menu, (b) reimplement as a TS door reading CALLERS.LOG, or (c) commit dedicated disassembly time. Option (b) is probably best — small TS door, bypasses the whole closed-binary problem.

### 4. **`Doors/livechat/server.ts` split** (2590 lines, over the 2000-line hook)
Single `createApp(session)` function with 37 inner functions all closing over shared state (screen/state/session/channelList/userList/inputBox/etc.). Existing `Doors/livechat/MODULARIZATION_PHASE2_PROGRESS.md` documents an active-but-paused multi-day modularization effort.

**Approach when picked up:**
- Read existing modularization docs first — there's a plan
- Pick LOWEST-closure-dependency functions first (cursor blink, dialog wrappers)
- Each extraction needs interactive UI validation in browser
- Don't bundle multiple extractions into one commit — easy to bisect regressions

**Why it didn't ship today:** risk-vs-reward bad after just having fixed a livechat prod bug; needs user available to validate each step.

## Critical references

### Files modified this session
- `web/backend/src/amiga-emulation/api/DosLibrary.ts` (5 LVO dispatcher fixes)
- `web/backend/src/services/game-mode.service.ts` (NEW — canonical helpers)
- `web/backend/src/server/socket-handlers.ts` (re-export)
- `web/backend/src/doors/BBSApi.ts:380` (delegate to canonical)
- `web/backend/src/handlers/door.handler.ts:1634` (SDK package path)
- `web/backend/src/handlers/door.handler.ts:1800` (helper instead of raw emit)
- `sdk/core/types.ts` + `sdk/src/core/types.ts` (interface declarations)
- `sdk/package.json` (added `./utils/door-preloader` export)
- `handoff.md` (project-root summary)

### Tests added
- `web/backend/tests/amiga-emulation/datestamp-d0-return.test.ts`
- `web/backend/tests/amiga-emulation/dos-d0-propagation.test.ts`
- `web/backend/tests/doors/bbsapi-game-mode.test.ts`

### Earlier in-session research
- `thoughts/shared/research/2026-04-25_datestamp-d0-and-ctop.md` — DateStamp investigation, CTOP dead-end notes

### Memory updates
- `~/.claude/projects/-Users-spot-Code-amiexpress-web/memory/project_door_bug_backlog.md` — moved DateStamp fix to FIXED list

### Commits (in order)
- `ace9e2451` fix(amiga-emulation): propagate D0 across dos.library LVO dispatcher
- `42082b096` refactor(doors): centralize game-mode helpers, fix BBSApi delegation
- `fe43b943d` docs(handoff): record D0 audit + game-mode refactor session
- `a26f1951f` fix(prod): use SDK package name for door-preloader require

## Learnings / gotchas

1. **DosLibrary has TWO LVO dispatchers** — `handleCall` (used by `AmigaDosEnvironment.handleSyscall`) and the vector-table in `dos-vectors.ts` (used by `LibraryTraps`). They serve different code paths and historically only the latter auto-propagated D0. Any DosLibrary fix touching D0 must update both — or extract helper logic so both naturally inherit it.

2. **Production ships only `sdk/dist/`** — never `sdk/utils/` or any other source dir. Anything in `web/backend/src/` that requires SDK files MUST go through the package import (`@amiexpress/bbs-door-sdk/...`) and the SDK's `package.json` exports map. Source-relative paths break in Docker. Pattern to grep for in audits: `require\('\.\.\/.+sdk\/'` and similar.

3. **The 0x04006920 byte pattern is NOT garbage** — wasted significant investigation time on the assumption that it was. Real Amiga BBSes write the same format. Cross-reference SanctuaryBBS captures FIRST when something looks like garbage.

4. **The pre-commit hook EXEMPTS oversized files** that are documented (DosLibrary.ts, door.handler.ts, etc.) — no `SKIP_SIZE_CHECK=1` needed for those. Required only for new oversize introductions or non-exempt files.

5. **Bash tool's working directory persists across calls** — but if a Bash call cd's into a subdirectory and exits, the next call inherits that. Cost me a few wasted runs when jest started failing with "Can't find root directory". Reset with explicit `cd` when in doubt.

6. **Monitor exit codes can mislead** — `npx tsc --noEmit | grep "error TS"` exits 1 if grep finds nothing (= clean tsc). Always inspect the underlying tsc exit, not the pipeline's.

## Verification baseline

For the next session to confirm this session's work didn't regress:
```bash
cd web/backend
SKIP_DB_INIT=1 npx jest --config dev-scripts/jest.config.ts --rootDir . tests/amiga-emulation/ tests/doors/bbsapi-game-mode.test.ts --no-coverage
# Expected: 254 passed, 11 suites
npx tsc --noEmit
# Expected: exit 0, no output
```

Live BBS: `https://bbs.uprough.net` — type `livechat` to verify the prod fix is live (was crashing pre-fix). `checkup` should work cleanly. `bulls` should work cleanly. `ctop` will silently exit (see backlog item 3).

## Next steps (ordered)

1. Fix `DoorManager.ts:777` per the inline `dev/scripts/install-sdk-doors.ts` removal plan above
2. Verify Hetzner deploy of `a26f1951f` actually fixed livechat for users (`docker compose logs --tail=200` on the host)
3. Pick one of: AquaScan (research-heavy, possibly disassembly), CTOP (probably reimplement as TS door), or livechat split (incremental, needs UI validation)
4. After any LVO/dispatch changes in DosLibrary.handleCall, run BOTH tests/amiga-emulation/datestamp-d0-return.test.ts AND tests/amiga-emulation/dos-d0-propagation.test.ts to catch regressions

## Other notes

- Server was running locally at end of session (started via `nohup ./dev/scripts/start-servers.sh --bbs-only`). PID 72537.
- Telnet port in dev defaults to 64128 (not 2323) because `.env` doesn't set `TELNET_PORT` and `web/backend/src/index.ts:777` defaults to `"64128"` — that's a separate cosmetic oddity, not blocking anything.
- Still 35-ish unrelated commits ahead of origin from prior sessions (all pushed today by the `git push origin main` run). Working tree has many runtime/build-artifact modifications (Doors/*/dist, Bulletins, Conf*, etc.) — pre-existing, not from this session.
