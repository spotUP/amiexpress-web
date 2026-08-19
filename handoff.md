# Handoff

## READ THIS FIRST in a fresh session

**Resume docs:** `thoughts/shared/handoffs/2026-08-19_d-calc-download-investigation.md`
(newest), then `..._repo-curation-and-doorrepo-fixes.md`.

**UNCOMMITTED work is in the tree** - the diagnostics below. Nothing is
deployed from it. Live still runs `1886fd527`.

**The one real open bug:** `-D-CALC.LHA` computed the same wrong SHA-256 twice
on live. It **does not reproduce**. Ruled out with measurements, not argument:
the server (curl from inside the container is correct), the archive (untouched
since 2026-06-02), http.c/the hash (a new head-less probe gets it right under
the emulator), the emulator's recv path (same probe), the exact door binary
that failed (`17b90db5f`, verifies fine here in both Ansi modes), and every
other archive on live (none hashes to `e44cef1b`). What is left is the live
BBS's own emulator instance under a real session - and the container was
recreated 3 hours later, so that evidence is gone.

Two instruments now exist to catch it next time, both OFF by default:
`BSDSOCKET_TEE_DIR` captures wire-vs-recv bytes at the emulator boundary, and
the door's `KeepFailedDownloads=yes` keeps a mismatching download as
`<name>.bad` instead of deleting it. `make probe-native` / `make probe-amiga`
build the head-less download probe. Enabling procedure: the investigation
doc's "To actually catch it".

## Where things stand

**Door repository** (`http://bbs.uprough.net/api/door-repo/`, read-only,
plain HTTP by design, gated on `DOOR_REPO_ROLE=owner`; contract
`docs/DOOR-REPO-API.md`). 3301 doors. `list.txt` carries ten fields;
`/manifest`, `/archive`, `/diz`, `/files`, `/doc` alongside it.

**Curation from DOORMAN, owner mode:** `D` deletes a door (catalog row +
archive file, permanent), `S` strips ad files - from an installed door's
directory, or, for `.lha`/`.lzh`, from the published archive in place via the
`lha` binary. LZX cannot be rewritten here (reader, no writer).

**DoorRepo** (`examples/doorrepo-c/`) is the reference C89 client for real
AmiExpress nodes and is installed on this BBS as a **sysop-only** command
(`ACCESS=255` - it can install and uninstall BBS commands). Its config lives
at `Doors/DoorRepo/DoorRepo.cfg` and uses the assigns the emulator actually
implements (`PROGDIR:`, `Doors:`, `BBS:`).

**Catalog performance:** `list.txt` is 0.12s internally / ~0.4s public, cold
door start under 1s. It was 9-15s until a correlated junk-count subquery was
replaced with a grouped join (13.05s -> 0.03s) and the rendered catalog
cached by revision.

## Standing traps

- **Deploys DO refresh `Doors/` for committed doors** (DoorRepo, DOORMAN
  dist), but never the live catalog DB - that is volume-mounted and needs an
  ATTACH staging merge, never a SQL text dump (`doc_raw` carries control
  bytes). Method: `2026-08-18_doorrepo-doorman-parity.md` section 1.
- **`Scripts/run-amiga-door.ts` runs `web/backend/dist/`**, not `src/`. It
  was four months stale when trusted. `cd web/backend && npm run build` first.
- **`Doors/door-manager/app.ts` is at 1999 of a hard 2000-line ceiling.** The
  next feature there needs a real split (`StripView`, `RepoView`).
- **The emulator hides real-node behaviour.** It delivers arrow keys to a
  door whether or not `rawArrow` is set, which is why DoorRepo shipped to
  Phantasm unable to navigate. express.e is the authority; check it first.
- **Edit/Write destroys high-bit bytes** - use cp/python/sed for
  binaries, corpus.json and anything Latin-1.
- `grep` here is **ugrep**: use `LC_ALL=C grep -a` on emulator logs and Amiga
  headers or it silently misses high-bit matches.

## Next

1. **Decide on the uncommitted diagnostics** - commit and deploy, or drop.
   They are inert until switched on.
2. **Send DoorRepo to Phantasm.** Package at
   `thoughts/spot/outgoing/DoorRepo-for-Phantasm.lha` (also on the Desktop) -
   REBUILD first: it predates both the blue-screen fix and
   `KeepFailedDownloads`.
3. Catch `-D-CALC.LHA` with the tee + `.bad` file (needs a deploy and one
   reproduction on live).
4. Phantasm's retest of the cursor-key (RAWARROW) fix - unverifiable here.
5. **Stale catalog rows.** `-D-CALC.LHA`'s row says 10431 bytes / md5
   `0f7b2806` (the pristine copy in `~/Code/amiexpress_doors`) while the served
   file has been 7943 bytes since 2026-06-02. The indexer never re-describes an
   archive that changed after indexing; any archive touched since carries wrong
   size and md5 in `list.txt`.

## Environment quickref

`SKIP_SDK_PREPARE=1 npm install --ignore-scripts`; jest config via tsx;
backend suite `cd web/backend && npx jest --config dev-scripts/jest.config.ts
--rootDir . --ci` (5166 tests, ~10 min under load, run ONE heavy thing at a
time); C suite `make -C examples/doorrepo-c test`, plus `native`, `amiga`.
Dev stack: `DOOR_REPO_ROLE=owner ./dev/scripts/start-servers.sh --bbs-only`,
BBS on :3001 (5173 is another app) - that script can stall for minutes in its
repo-wide `find -delete`, so for API work run `DOOR_REPO_ROLE=owner npx tsx
src/index.ts` from `web/backend` instead. Live host: `root@89.167.21.154`,
container `amiexpress-bbs`.

Older sessions: `thoughts/shared/handoffs/` (08-17 and 08-18 archives, May
rollup).
