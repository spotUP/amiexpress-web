---
date: 2026-08-20
topic: DoorRepo installs never extracted anything - the emulator has no shell; Execute() now unpacks LHA; install refuses a false success
tags: [handoff, doorrepo-c, door-repo, 68k, emulator, dos-library, lha, install, cors, caddy]
status: final
---

# Session handoff - 2026-08-20 (early) - the archiver that never ran

Continues `2026-08-19_doorrepo-speed-and-install-fixes.md`. That session
fixed two things about a door installed while the BBS runs (atomic `.info`
write, BBSCmd freshness stamp over the FILES). Both were real. Neither was
why the reported door would not run.

## HOW TO RESUME

1. `git log --oneline -3` - `c2ff0b260`, `4f94befdc` are this session's
   fixes; everything is pushed.
2. **The end-to-end path has NOT been confirmed by a human yet.** No
   `Doors/5DD/` and no `Commands/BBSCmd/5DD.info` exist locally. Install a
   door through DOORREPO and type its command without reconnecting.
3. The local backend was restarted at the end of this session (pid was
   13012) with `BBS_DATA_DIR=<repo> NODE_ENV=development
   DOOR_REPO_ROLE=owner npx tsx src/index.ts`, logging to `logs/backend.log`.

## The headline: there is no shell inside the emulator

DoorRepo installs a door by asking the archiver to unpack its archive.
`run_extractor()` did that with C `system()`. Under this project's 68K
emulator the vbcc runtime's `system()` **reaches nothing at all** - it
returns 0, the success value, without making a single dos.library call.

Proof, from `logs/backend.log` around line 60671 of a real session:

```
String: "Extracting 5D!DP002.LHA into Doors:5DD/ ..."
[BsdSocketLibrary] send data: GET /api/door-repo/files/5D!DP002.LHA ...
[dos.library] Open (FileManager) failed for "Doors:5DD/HiScore" IoErr=205
```

No `Execute()`, no `SystemTagList`, nothing between the message and the next
HTTP fetch. **No DoorRepo install has ever extracted a file on this
platform.** `Doors/5DD` and `Doors/ZIPPY` did not exist; both archives sat
un-extracted in `Doors/DoorRepo/downloads/`.

The door then installed anyway: the only complaint was the soft
`INSTALL WARN: program not readable, LOCATION kept`, which exists on purpose
(TELSER40.LHA extracts `bin/telser` with protection bits that defeat
`fopen()`). So a command config was published naming a file that had never
been written, and the BBS answered "No such command" for a door it had just
been told about. That is the bug as reported.

## The three fixes (all pushed)

**(a) The door reaches the archiver - `c2ff0b260`.** New platform pair
`examples/doorrepo-c/shell.h` + `shell_amiga.c` / `shell_native.c`, the same
shape `aedoor.h` already uses. AmigaOS calls `dos.library/Execute()`; the
host build keeps `system()`. `doorrepo.c` keeps its no-platform-branches
rule. The command string is built by `flow_build_extract_command()` - pure,
therefore testable, which matters because a wrong command still prints
"Extracting..." and looks identical from the door's output. It refuses any
value containing a double quote rather than escaping: `/bin/sh` and the
AmigaDOS shell do not agree on quoting.

**(b) The emulator extracts - `4f94befdc`.** `Execute()` refuses shell
commands by design; it now makes one exception. `LhA x <archive> <dest>` is
carried out by the LHA reader the backend already ships (new
`extractLhaArchiveSync()` in `utils/extractors/lha-extractor.ts`, sync
because a trap must set D0 before the CPU resumes and there is nowhere to
await - lha.js itself always was sync, only the class wrapper is async).
Members carry AmigaDOS backslash separators and become real directories; a
member resolving outside the destination is refused.

**LZX fails explicitly** - its extractor is wasm-backed and async. Installs
of `.LZX` archives will now REFUSE rather than silently produce nothing.
That is a known, deliberate gap.

**(c) No more false INSTALL OK - `c2ff0b260`.** `flow_install_verdict()`
decides from three independent signals instead of the archiver's word, and
adds one refusal: archiver claims success + the listing names files + a
bounded census (12 rows, stops at the first hit) finds none of them. The
protection-bit case still installs with a warning, because there the
siblings DO exist - that difference is what separates "protected" from
"never extracted".

## Learnings worth keeping

- **`system()` is a no-op inside the emulator.** Any door that shells out
  believes it succeeded. Doors must call `Execute()`; the emulator answers
  only the allowlisted commands (DATE, AVAIL, INFO, VERSION, SHOWCONFIG,
  COPY, DELETE, RENAME, and now LhA extraction) and returns DOSFALSE for the
  rest.
- **"The tool reported success" is the weakest signal available.** It was
  the only one being trusted here, and it was worth nothing. Check the
  artifact, not the exit code.
- **The symptom pointed at the wrong layer twice.** "Installed door not
  recognised until reconnect" produced two correct fixes (atomic `.info`,
  file-level freshness stamp) that could not have fixed the reported case,
  because the door being named had never been unpacked. The evidence that
  settled it was a log window, not a hypothesis.
- **Check WHICH server is running before concluding anything.** The reported
  retest ran against a backend started at 22:46:23, three minutes before the
  freshness fix's source was written at 22:49, with no watch mode. `lsof
  -nP -iTCP:3001 -sTCP:LISTEN` plus `ps -o lstart` answers this in one line.

## Also done this session

- **Duplicate `Cross-Origin-Resource-Policy` fixed at the source.** It was
  **Caddy**, not Express: `/etc/caddy/Caddyfile` set the header on lines 2
  and 56, and Caddy's non-deferred `header` writes at request time while
  `reverse_proxy` copies the upstream one in, so both survived
  (`cross-origin` + `same-origin` on the site root - conflicting, and a
  browser rejects that). Express's `doorRepoCors` already sets it per path,
  so both Caddy lines were deleted. Backup:
  `/etc/caddy/Caddyfile.bak-corp-dupe-20260819`. **The Caddyfile is not in
  the repo.** Verified live: root `same-origin`, `/api/door-repo/*`
  `cross-origin` over HTTPS and plain HTTP, preflight 204, a real archive
  GET carrying `x-archive-md5`.
- **Phantasm's archive rebuilt** (`package-for-amiga.sh`, 57 files, digest
  round-tripped).
- Host pruned 90% -> 80% before the first deploy.

## Open items

1. **Nobody has installed a door successfully yet.** This is the one thing
   that proves the session's work.
2. **The LOCATION picker.** For `5D!DP002.LHA` it chose `HiScore`, which for
   a doorpack is almost certainly not the door's program. Now that files
   actually land, this becomes visible and worth revisiting.
3. **The live download corruption** is unchanged and still unexplained.
   `KeepFailedDownloads=yes` is live; the next failure keeps `<name>.bad`.
4. **LZX installs refuse** until something sync can unpack them.
5. Two pre-existing flaky suites: `config-routes`, `info-editor-routes`.
6. `Doors/door-manager/app.ts` is at the 2000-line ceiling.
7. DOORMAN parity gap list - see the previous handoff; the keystone is still
   the directory-scan shim.

## Verification state

- Backend jest: **5204 passed**, 1 failed (`info-editor-routes`,
  pre-existing, load-flaky). Emulator suites 37/37, 517 tests.
- New: `tests/amiga-emulation/execute-lha-extract.test.ts`, 10 tests, 4 of
  them verified to FAIL against the old code.
- C: `test_flow` 254 assertions green (13 new, all verified failing first),
  every `make test` suite green, `native` / `amiga` / `amiga-stub` /
  `probe-native` / `probe-amiga` all build. The `amiga-stub` vbcc warnings
  are the pre-existing `devices/timer.h` anonymous-union ones.
- `npx tsc --noEmit`: clean.
- Door binary `Doors/DoorRepo/doorrepo.amiga` md5
  `8097e4bc59557510dda77278fa145985`.
