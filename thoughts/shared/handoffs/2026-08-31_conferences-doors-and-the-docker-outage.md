---
date: 2026-08-31
topic: Conference admin made real, the J door reads the board, and the Docker daemon outage
tags: [handoff, admin, conferences, info-files, joincnf, deploy, docker, buildkit, incident]
status: final
---

# Handoff, 2026-08-31 (afternoon session)

Read with `handoff.md` at the repo root. This is the whole session, including
the two things I broke and how they were repaired.

## State at the end

Live is `9af19730f` (or later - other sessions push door work constantly).
All eight containers on the host are up. Docker live-restore was being
enabled as this was written; `handoff.md` says whether it took.

Everything below is deployed and verified on the live board unless marked.

## What was done, in order

1. **Three conference commits pushed** (`70e84acd7`, `54fe02c0a`, `ad308280f`):
   a failed tracked copy is loud; delete finishes or refuses; create registers
   in `ConfConfig.info` and keeps the typed name.
2. **The form had no name field** - the backend honoured a name the UI could
   never send. Added, plus row-click-to-edit (`25790f1e7`).
3. **Every `Conf<N>.info` and `Node<N>.info` refused to save** -
   "tooltype array structure not recognised". Their array has a length prefix
   on the FIRST entry only; the rest are bare NUL-terminated. The parser hunted
   for a strictly standard array and missed. It now walks the DiskObject to the
   array's real offset (`locateTooltypeArrayStructural`,
   `web/backend/src/utils/info-file.util.ts`), accepts both forms, and the
   writer heals the file on the first save. Measured before writing: 1012
   files agree with the old scanner, 43 more become readable, none lost.
4. **Admin pages cited `express.e:NNNN` at the sysop.** Gone from everything
   rendered; a test strips comments from every page and fails on any
   `file.e:line` that could reach the screen.
5. **A rename reached disk and not the board.** The conference list is built
   once at boot and handed to eight consumers. Now `refreshConferencesFromDisk`
   (in `server/initialization.ts`) runs at boot and after every admin write,
   through `services/conference-change-bus.ts` - the service must NOT import
   the server module; doing so boots a second BBS inside the test worker.
   The arrays are replaced IN PLACE (`replaceInPlace`) because every consumer
   keeps the reference it was given at boot.
6. **Middle conferences can be removed** (`ConferenceRemovalService`).
   A conference is a POSITION (`express.e:8506`), so removing 3 of 14
   renumbers 4..14 AND shifts every account's `conferenceAccess`, the six
   SQLite tables keyed by conference id, and `Conf.DB`, in one deferred-FK
   transaction, after copying everything to `_conf-backups/`. Directories do
   not move - `LOCATION.n` carries the mapping. The delete-files switch lives
   in the confirm dialog (`ConfirmDialog` gained `checkbox`; `confirm()`
   answers `{confirmed, checked}` when one is asked for).
7. **The SQLite mirror never deleted rows.** `syncConferencesFromDisk` prunes
   by membership, only when the caller passes `{ complete: true }` - the
   boot/refresh path does; the repository's fragment-syncing tests do not.
8. **Create failed with FOREIGN KEY** once the stale rows were gone:
   `conference_config.conference_id REFERENCES conferences(id)` and create
   inserted the config row first. Order is now disk -> mirror row
   (`ensureConferenceRow`) -> config row. New conferences are auto-numbered
   `NCONFS+1`, read-only in the form.
9. **The J door showed a deleted conference.** `J` is
   `Doors:emp_tools/joincnf`. It reads `NCONFS` and `NAME.n` from
   `BBS:ConfConfig.info` via icon.library, BUT any `CNF_NAME.n` line in
   `joincnf.cfg` wins verbatim. Measured against the real binary: line
   present -> cfg string; line removed -> icon name, same formatting. All 36
   hand-typed `CNF_NAME.n` lines removed from `Doors/emp_tools/joincnf.cfg`;
   door binary, emulator and `CNF_NAMES YES` untouched. Test:
   `web/backend/tests/doors/joincnf-names-from-icon.test.ts`.
10. **Disk**: build cache was 11.8 GB; pruned 10 GB by hand. Then the
    incident below.

## The incident - read this before touching Docker on the host

I added `docker builder prune -f --filter until=168h` to the end of every
deploy (`aa0d1c269`). Within the hour buildkit's cache database corrupted:
`panic: page 4708 already freed` in bbolt, dockerd exit status 2, **six
crashes in ten minutes, one per image build**. Live-restore was off, so each
crash stopped EVERY container on the host - board, door server, retroranks,
devilbox, bratwurst, postgres. The board was down twice.

Causation is not proven (bbolt can corrupt on an unclean stop) but the prune
was the only new variable. Repair, with the sysop's go:

    systemctl stop docker.socket docker     # BOTH - the socket re-activates the daemon
    mv /var/lib/docker/buildkit/{cache.db,history_c8d.db} aside
    systemctl start docker.socket docker
    docker start <the eight containers>     # unless-stopped did NOT bring them back

First attempt stopped only `docker`; the socket restarted it and I moved a
fresh 32 KB file. Stop the socket too. Corrupt files are kept at
`/root/buildkit-*.corrupt-20260831`. The prune step is removed (`9af19730f`).
A full cold build then succeeded with 0 restarts, 0 panics.

**Never restart dockerd while a `docker compose` process is running.** That is
the corruption path.

## Learnings

- **Verify the deploy by reading the container.** `docker exec amiexpress-bbs
  cat /app/.git-sha`, container age, and for door files the volume copy.
- **`SKIP_DB_INIT=1` is for isolated unit tests.** On the full suite it turns
  every DB-backed suite red.
- **Run `npm run typecheck:tests`.** I broke CI once by running `tsc --noEmit`
  and jest only.
- **Do not import `server/initialization` from a service.** Boots the server.
- **Module-level singletons imported at file top change the import graph**
  enough to crash unrelated suites (`config-routes.test.ts`). Import them
  inside the write path.
- **`message-scan-parity` and `log-retention` are flaky/env-only**; the dev
  backend on :3001 makes several suites exit 1 with all tests passing.
- **Row actions bubble to `onRowClick`.** `DataTable` now stops propagation
  in the actions cell.
- **A test that mocks the half the bug lives in passes while the bug is
  live.** The page test mocked the notification context, the dialog test
  drove a fake page; the real-page-real-provider test caught it.

## Open

- Live-restore: check `docker info | grep -i "live restore"` says Enabled.
- Disk reclaim is manual again; disk at 55%. Prune only with the daemon idle.
- `Doors/emp_tools/joincnf.cfg` still carries `CNF_PASS.21/22` for conferences
  the board does not have; harmless.
- The two `.corrupt` files under `/root` can be deleted once nobody wants them.
- `conferences.name` is UNIQUE in the mirror; `ensureConferenceRow` falls back
  to `name (id)` on collision and the next sync renames it from disk.
