---
date: 2026-08-24
topic: doors.uprough.net admin console shipped and live; the ARexx process-hang fixed on its own branch; phase2-door-proxy scoped and resume authorized through Task 7
tags: [handoff, doorserver, arexx, phase2-door-proxy, sdd]
status: draft
---

# Session handoff — 2026-08-24

Three separate threads this session, in the order they landed. Read
`handoff.md` first — this is the detail behind its three bullets.

## 1. doors.uprough.net: public browser + admin console — DONE, all 8 phases, LIVE

Repo `github.com/spotUP/amiexpress-doorserver` (separate checkout at
`/Users/spot/Code/amiexpress-doorserver`, deployed on the host at
`/app/doorserver`). Live SHA `aeae5ca`, verified in the container. Plan:
`amiexpress-web:thoughts/shared/plans/2026-08-23-door-repo-admin-and-public-browser.md`
— every phase done and deployed:

- **Phase 0** — `src/describe.ts`, the description/name classifier ported
  from `amiexpress-web:dev/scripts/door-index/description_rules.py`.
  Verified equal to the prototype ROW FOR ROW across the whole 3301-door
  catalog. Any future rule change must land in BOTH files and both test
  suites (`tests/describe.test.ts` here, `test_description_rules.py`
  there) or they silently diverge again.
- **Phase 1** — per-field overrides (`door_catalog_overrides`); a corpus
  re-scan can never destroy a manual edit. Catalog revision carries an
  edit/hide stamp so no cache serves stale bytes.
- **Phase 2** — admin auth: scrypt (not argon2 — a second native addon
  would be a second way for this musl-alpine image to fail at require
  time), JWT in the Authorization header, no cookie, no CSRF surface.
  `DOORSERVER_JWT_SECRET` is optional — unset, the admin API is 503 and
  the public site is untouched.
- **Phase 3** — public JSON API (`/doors`, `/doors/:name`, `/facets`,
  `/events` SSE).
- **Phase 4** — admin write API (PATCH/DELETE overrides, redescribe
  preview, audit trail). Field names are an allowlist, never raw SQL.
- **Phase 5/6** — the browser UI: React + Vite + Tailwind + Radix, dark
  theme, Topaz font for DIZ/guide text, AmigaGuide docs parsed with the
  BBS's own copied parser (`src/amigaguide-parser.ts`, mirrors
  `web/backend/src/amigaguide/AmigaGuideParser.ts` — keep both in step).
  A "Needs a name" toggle finds doors whose display name is only a
  filename guess (`?name_source=archive`, computed in memory since
  provenance isn't stored).
- **Removal** — `door_hidden` table (not a DELETE — a corpus re-scan
  would just resurrect a deleted row). Hide/restore, own admin panel.
- **Phase 7** — anonymous submissions with a curator approval queue.
  `src/archive-reader.ts` reads a submitted LHA IN MEMORY (the BBS's own
  `lha.js`, copied) so an approved door arrives with Name/Version/
  Author/Needs/Description already filled from its FILE_ID.DIZ, not an
  empty row.

**One real outage during this work, already fixed**: the first deploy of
the archive-reader crash-looped the container for ~4 minutes —
`lha.js` is plain JS in `src/`, `tsc` never emits it, so
`dist/src/lha.js` didn't exist and the compiled server threw
`MODULE_NOT_FOUND` at boot. Fixed by copying it in the build script
(same as `schema.sql` already was) AND adding a Dockerfile step that
`require()`s the compiled server once during the image build — this
class of mistake now fails the BUILD, not the host.

Credentials: login `spot`, password + JWT secret in
`/app/doorserver/.env` on the host (chmod 600, not in any repo).
Rotating the password needs BOTH editing `.env` AND deleting the
`admin_users` row — bootstrap never overwrites an existing account, and
there is no change-password endpoint yet.

## 2. The ARexx process-hang — root-caused, fixed, on its own branch, NOT merged

`amiexpress-web`, branch **`fix/arexx-runaway-hang`** (based on `main`,
2 commits, NOT pushed, NOT merged). Do not confuse this with
`phase2-door-proxy` — the two fix commits were cherry-picked cleanly OFF
of phase2-door-proxy onto their own branch off main, specifically so this
production bugfix isn't entangled with the paused, unrelated proxy work.
`phase2-door-proxy` still also carries these same 2 commits at its tip
(harmless — they'll no-op on merge once this branch lands first).

**The bug** ("AREXX script spins at 100% CPU, no log output, only a
container restart clears it" — ACCV103/AccEd.Rexx): `Open('UserData',
...)` fails silently (that legacy AmigaDOS binary path doesn't exist on
this SQLite-backed BBS). `Do Until NrUsers > 0` then never terminates.
Every iteration resolves through already-settled promises — pure
microtasks, never a macrotask — which starves Node's event loop
COMPLETELY, not just the script. Proved empirically: a diagnostic
`setInterval(500ms)` wrapped around `interpreter.execute()` never fired
once in 4 real seconds. The whole process was dead.

**Three fixes, two commits:**

1. `74abe0dec fix(arexx): Seek/ReadCh byte-accurate, not line-accurate`
   — `web/backend/src/services/arexx-file-io.ts`. rexxsupport.library's
   Seek/ReadCh are byte-offset ops against arbitrary (binary) content;
   the interpreter pre-split content into TEXT LINES and operated in
   LINE units. `RexxFileHandle` now holds `content` (latin1, 1 char = 1
   byte) + one byte cursor `pos`, shared by readln/readch/seek. `readln`
   rewritten to match the OLD split()-based behaviour byte-for-byte
   (including its trailing-empty-read quirk) so no other door's
   text/log/config file usage regresses. 12 new tests.

2. `cc2d0c407 fix(arexx): runaway-loop watchdog...` —
   `web/backend/src/services/arexx.service.ts`. Added `yieldIfBusy()`,
   called first thing in `executeLines`'s per-clause loop: periodically
   yields a real `setImmediate` turn (so socket I/O / Ctrl+C / health
   checks can run even mid-spin), and aborts after 30s of ACCUMULATED
   continuous compute through the SAME flags Ctrl+C already uses
   (`maybeAbortInterpreter` — HALT trap if the script has one, else
   clean RC=-1 exit). A genuine GETCHAR/PROMPT wait on a user is never
   charged against the budget (large single-step gaps reset the clock).
   Test-only tuning hooks (`_setWatchdogTuningForTests`) let the real
   30-second abort be proven in milliseconds.

   **Also found and fixed while proving this against the real script**:
   `executeDo`'s five loop variants (FOREVER/WHILE/UNTIL/TO/count) never
   checked `signalRequested` after each body pass — only `executeLines`
   and `executeSelect` did. A SIGNAL whose target is OUTSIDE the loop
   body (the normal case — a HALT: label almost never lives inside the
   loop it traps) left the flag set for "the parent frame to jump," but
   `executeDo` isn't that frame and just kept blindly re-entering
   `executeLines`, which no-opped every time — a SECOND independent way
   to hang forever, hit by my own watchdog's HALT-trap path. Fixed with
   the same `if (this.signalRequested) break;` check `executeSelect`
   already had, in all 5 places.

Verified against the REAL 596-line AccEd.Rexx, not a synthetic repro:
the 30s watchdog now ends the hang cleanly. Full backend suite: **5216
passed, 0 failed** (2 pre-existing skipped suites, unrelated).

**A third, unrelated gap surfaced, NOT fixed, out of scope for this
bug**: once the real script could finally run far enough, it hit
`Unknown function: MSGLOG` — AccEd.Rexx calls its own internal `MsgLog`
PROCEDURE using REXX function-call syntax (`MsgLog(args)`, not `CALL
MsgLog args`), and the interpreter's dispatcher doesn't fall back to
internal-procedure resolution before throwing. ACCV103 still won't fully
run end-to-end until this is separately addressed — the hang itself is
what's fixed.

**Next**: decide whether to push/merge `fix/arexx-runaway-hang` (a push
to `main` deploys the live BBS automatically — confirm before pushing).
Then decide whether the MSGLOG gap is worth a follow-up.

## 3. phase2-door-proxy — scoped precisely, resume AUTHORIZED through Task 7

Branch `phase2-door-proxy`, 28 commits ahead of main, unmerged, **nothing
deployed** — the live BBS still serves its own catalog exactly as before.

Plan: `docs/superpowers/plans/2026-08-23-door-server-phase2.md` (its own
header mandates `superpowers:subagent-driven-development` to execute
it). Spec: `docs/superpowers/specs/2026-08-23-door-server-split-design.md`.
Controller ledger with every ruling made so far (git-ignored):
`.superpowers/sdd/2026-08-23-door-server-phase2/progress.md` — READ THIS
FIRST on resume, it is the actual source of truth; the plan's own
checkboxes were never checked despite Tasks 1-4 being done.

**Done and reviewed** (Tasks 1-4): `door_installs` table + repo; backfilled
from the live catalog (found 79 rows marked installed but only 51 distinct
commands — some genuinely different doors sharing a command name, now
named explicitly rather than silently guessed); the proxy itself
(`/api/door-repo/*` → `DOOR_SERVER_URL`, sqlite handlers deleted not kept
as fallback); `BBSApi` reads `door_installs` instead of the catalog.

**Left, in order** (Task 5→8):

- **Task 5** — DOORMAN records installs locally. Dispatched once
  previously, never completed (session ended, no implementer commit
  exists). Pre-audited traps already in the ledger: DOORMAN can't import
  backend paths, needs a `require.cache` scan (`getInstallsRepo()`
  mirroring the existing `getCatalogSvc()` at `app.ts:67-71`); the
  plan's own snippet references a `manifestRevision` field that doesn't
  exist — record `source_revision: null` instead; there's a
  command-collision guard in the code being replaced (refuses install
  when the command is held by a DIFFERENT archive) that MUST survive via
  `getInstallByCommand` — Task 2 proved commands can be claimed by up to
  nine archives, so losing this is a real regression. Exact line to
  change: `repoDataSource.ts:160`.
- **Task 6** — vendor the contract mirror. Rehearsed already (ledger:
  "the vendored ManifestDoor mirror is field-identical to the door
  server's contract today") — regeneration + a staleness test, not a
  migration.
- **Task 7** — deploy. **Blocked on measured infrastructure fact**: the
  BBS container cannot reach the door server over `127.0.0.1` — they sit
  on separate Docker bridges. Already ruled (don't re-litigate): a shared
  external network `doorserver-net` both compose files join,
  `DOOR_SERVER_URL=http://doorserver:3010` via service DNS. Needs
  `docker network create doorserver-net` on the live host
  (`root@89.167.21.154`) plus a compose stanza in BOTH
  `amiexpress-web`'s and `amiexpress-doorserver`'s docker-compose (two
  separate repos/checkouts — doorserver lives at `/app/doorserver` on
  the host). The door server binds loopback-only DELIBERATELY (phase 1's
  security choice) — do not widen that to solve this. Task 7's
  merge-to-main is the point this actually goes live (push triggers
  auto-deploy) — confirm before merging, verify after (the BBS's
  `/api/door-repo/*` must round-trip through the proxy to the real
  server, not just "both containers started").
- **Task 8** — drop the BBS's own `door_catalog`/`door_catalog_files`
  tables. The plan itself gates this on separate explicit human approval
  and a backup. NOT authorized as part of this resume regardless of how
  far Tasks 5-7 get. Its DDL removal is at `database.ts:1732`, `:1763`
  (CREATE statements) and `:786-800` (column migration) — must be
  removed FIRST or the tables silently recreate empty on the next boot.

**User has explicitly authorized resuming through Task 7** (asked "all
the way through Task 7 (deploy)" when offered a choice of stopping
after Task 6, going through Task 7, or just reporting state). Task 8
stays separately gated no matter what.

**Why this is a fresh-session task**: subagent-driven-development
dispatches many subagents per task (implementer + reviewer + fix
rounds), each round's output re-entering context — genuinely heavy, and
this session already carries the doorserver build-out and the ARexx
investigation. Start clean: `git checkout phase2-door-proxy`, invoke
`superpowers:subagent-driven-development`, resume at Task 5 using the
ledger above as ground truth (do not re-verify Tasks 1-4, they're
reviewed-clean commits already in the log).

## Other state carried over, unrelated to the three threads above

- Root `handoff.md`'s existing bullets (ARexx hang details, other BBS
  work) — see `handoff.md` itself and its own linked resume chain for
  anything not covered here (this doc supersedes its ARexx-hang bullet
  specifically; the door-server-live bullet is now doorserver-admin-live
  above).
- Working tree carries the usual runtime noise (`Conf.DB`,
  `Node1/CallersLog`, `web/backend/debug-display-flow.log`,
  `.playwright-mcp/*` session logs) — never commit these, matches every
  prior handoff's warning.
