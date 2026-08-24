---
date: 2026-08-23
topic: Full session handoff - door server split (phase 1 shipped, phase 2 half-built), the four install bugs fixed on live, and a door index for two external developers
tags: [handoff, doorserver, door-repo, phase2, uhc, cors, arexx, infrastructure]
status: final
---

# Full session handoff - 2026-08-23

A long session. Four threads ran; two are finished, two are not. Read this
section first and the details only for the thread you are picking up.

| Thread | State |
|---|---|
| **Door server, phase 1** | **DONE and PUBLIC** at `https://doors.uprough.net/api/door-repo/` |
| **The four door-install bugs** | **FIXED and PROVEN ON LIVE** - this is what started the session |
| **Door server, phase 2** (BBS becomes a client) | **HALF BUILT** - 4 of 8 tasks, unmerged branch, nothing deployed |
| **Index for Patrik + Phantasm** | **CODE COMMITTED, NOT PUSHED**; description rules tuned but not yet implemented |

Nothing is broken. The live BBS and the live door server are both healthy.

---

## 1. Door server - phase 1 (finished)

`github.com/spotUP/amiexpress-doorserver` serves the 3300-door catalog from
its own repo, database, container and CI. Byte-identical to what the BBS
serves, verified by a parity harness (28 captures) that detects a single
changed door among 3301.

Live today: HTTPS, **and plain `http://` with no redirect** (added for 68k
clients that cannot do TLS). Deploy is `git push` -> CI -> container rebuild;
the secrets are set (a dedicated `doorserver-deploy` key, not a human key).

Full detail: `2026-08-23_door-server-split-phase1.md`.

## 2. The four install bugs (finished, verified on live)

ACC-V103 was installed through DOORREPO **on the live board** and the whole
chain worked: extraction ran, junk ads were stripped, the `.info` was written
with `TYPE=AIM` and `LOCATION=Doors:ACCV103/Account/AccEd.Rexx`, and the
command was accepted at the menu **without reconnecting**.

Then it hung - see thread 5.

## 3. Door server - phase 2 (HALF BUILT, resume here)

Branch **`phase2-door-proxy`** in amiexpress-web, 14+ commits, **unmerged and
undeployed**. The live BBS still serves its own catalog exactly as before.

Done: Task 1 `door_installs` table + repository; Task 2 backfill; Task 3 the
proxy (`/api/door-repo/*` -> `DOOR_SERVER_URL`, sqlite handlers deleted);
Task 4 `BBSApi` reads installs.

Remaining: Task 5 DOORMAN, Task 6 contract mirror, Task 7 deploy, Task 8 drop
the BBS's catalog tables.

**Traps already found and written into the plan - do not rediscover them:**
- The BBS container **cannot** reach the door server on `127.0.0.1:3010` (that
  is the container itself). Both compose files must join an external
  `doorserver-net`; the URL is `http://doorserver:3010`.
- Task 8 must FIRST remove the `CREATE TABLE IF NOT EXISTS` statements at
  `database.ts:1732`/`:1763` and the migration at `:786-800`, or the tables
  silently reappear on the next boot.
- DOORMAN cannot import backend modules; it reaches them through a
  `require.cache` scan (`getCatalogSvc()`, app.ts:67-71).
- DOORMAN has a collision guard that must survive: it refuses to install when
  a command is already held by a different archive. This catalog has commands
  claimed by up to NINE archives.

Plan: `docs/superpowers/plans/2026-08-23-door-server-phase2.md`.
Ledger with every ruling: `.superpowers/sdd/2026-08-23-door-server-phase2/progress.md`.

## 4. The index for Patrik (UHC) and Phantasm (scenewall)

**Committed to the door server repo, NOT pushed:** `/index.tsv` (tab-separated,
ISO-8859-1, LF), `.diz` siblings at the archive's own path,
`/archive/<system>/<file>` routing, and CORS (wildcard origin, mirroring the
BBS, plus `Cross-Origin-Resource-Policy: cross-origin`). Reviewed once; one
fix round applied. `npm run test:parity` green.

**Not yet implemented: the description rules.** Those were tuned in this
session across fifteen rounds of corrections from the catalog's owner and live
in `dev/scripts/door-index/description_rules.py` (a PROTOTYPE - read its
header). The door server's `src/index-tsv.ts` must be brought in line with it.
Current prototype coverage on 3301 rows: **77% version, 42% author, 100% plain
text**, versus a first attempt whose descriptions were mostly ASCII frames.

Preview output for review: `~/Desktop/door-index-PREVIEW.tsv` (machine format)
and `.txt` (aligned, readable).

**Before telling either developer anything**, run
`dev/scripts/verify-doorserver-live.sh` - ten checks against the live host. It
currently fails the ones that are not deployed and passes the four that are.

Documents for them are on the Desktop and already point at `doors.uprough.net`:
`door-repo-api-for-phantasm.md` (he can go live immediately - his page carries
a FROZEN 2.75 MB manifest pasted into the HTML because CORS looked broken to
him in August; it was the duplicated CORP header, fixed since) and
`door-repo-index-for-patrik.md` (he cannot go live until the above is pushed).

**Owner's next idea, not started:** for the ~759 rows with no version and ~1891
with no author, unpack the archives and read the included docs. Sound - the
corpus and the extractors are both to hand - but it belongs in the corpus
BUILDER as a one-off enrichment pass writing back to `door_catalog`, not in the
TSV renderer. Budget it as its own piece of work.

## 5. Open bug: the ARexx engine hangs on a real door script

`ACC-V103` installs and routes correctly, then the interpreter spins at **100%
CPU with no log output** after `Executing AREXX script: ACCV103`. Measured:
looping, not blocked; only a container restart clears it. **Reproduce OFF the
BBS** - it takes a whole core. Suspects are in the script's opening:
`signal on syntax/error/ioerr`, hex literals (`CR='0D 0A'x`),
`address value "AERexxControl"node`, host commands `GetUser`/`sendmessage`.
Installed copy: `/app/data/bbs/Doors/ACCV103/Account/AccEd.Rexx` on live.

## 6. Infrastructure changed today

- Hetzner box rescaled: **40 GB -> 80 GB disk** (CPX22, ~EUR 24/mo). Disk went
  91% -> 81%; it is now at 34% of 75 GB.
- The two unbounded growers are capped: systemd journal (was 3.1 GB) at 200 MB
  permanently, and docker log rotation (20 MB x 3) - applied to the BBS
  container by recreating it, and to others as they are next recreated.
- Caddy gained two blocks: the `doors.uprough.net` vhost and a plain-HTTP
  block. Backups are beside `/etc/caddy/Caddyfile`. **That file carries no
  `header` directives on purpose** - Caddy and Express both setting
  `Cross-Origin-Resource-Policy` is what broke this host once already.

## 7. What to do first in a fresh session

1. `dev/scripts/verify-doorserver-live.sh` - know what is actually live.
2. Decide the thread: finish phase 2 (Tasks 5-8), or finish the index work and
   unblock the two developers. The index work is closer to done and has people
   waiting.
3. If the index: port `description_rules.py` into `src/index-tsv.ts` with
   tests, re-review, push, verify, then send the two Desktop documents.

---

## Why a door could be "installed" and still not run

FIVE separate causes, all now fixed, found in this order. Each one hid the
next, which is why this took three sessions:

1. `.info` written with `fopen()` - published empty, filled in after
   (`7ace19931`).
2. The BBSCmd freshness stamp watched only the directory's mtime, which does
   not change when a file is filled in or edited (`b58ac0544`).
3. **The archive was never unpacked at all** (`4f94befdc`, `c2ff0b260`). The
   door shelled out with C `system()`, and inside the 68K emulator that
   reaches NOTHING - it returns 0, the success value, with no dos.library
   call. Doors now call `Execute()`; `Execute()` unpacks LHA using the
   backend's own reader; and an install that extracted nothing is refused
   instead of reported OK.
4. **The watcher's reload signal was swallowed by the startup guard**
   (`5273075ed`). `invalidateBbsCommandFreshness()` announced "reload now"
   by setting the stamp to `null` - and `null` is exactly what
   `revalidateBbsCommandsIfChanged()` reads as "first call, this is the
   startup baseline, do not reload". A forced reload was therefore always
   skipped, which is why the command still said "No such command!!" until
   the BBS was restarted. Now a separate `bbscmdForcedStale` flag carries
   the signal. Two existing tests had encoded the bug as correct and were
   rewritten.
5. **The picker could not find the door's program** (`614631462`,
   `05f82761d`). `ACC-V103.LHA` ships no executable at all - only
   `AccEd.Rexx`. The picker fell through to the command name and wrote an
   impossible LOCATION, so the BBS said "Door executable not found.". Rule 3
   now picks the largest `.rexx` when no binary exists, and such a door is
   written as **`TYPE=AIM`**, not XIM: express.e runs AIM through
   `REXXDOOR <node> <cmd>` (express.e:4272-4276) while XIM executes the
   LOCATION file directly (express.e:4278), which a `.rexx` cannot do on a
   real node. The override only applies when the catalog type is empty or
   XIM.

(Moved out of the root `handoff.md` on 2026-08-23 to keep it under its size
cap; all five causes are fixed and the detail lives here as the audit trail.)
