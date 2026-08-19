---
date: 2026-08-19
topic: The -D-CALC.LHA checksum failure - what it is not, and the instruments built to catch it
tags: [handoff, doorrepo-c, door-repo, 68k, bsdsocket, emulator, diagnostics]
status: final
---

# Session handoff - 2026-08-19 - chasing the -D-CALC.LHA mismatch

Follows `2026-08-19_repo-curation-and-doorrepo-fixes.md`, whose open item 1
this session went after: DoorRepo on the live BBS computed the same wrong
SHA-256 for `-D-CALC.LHA` on two consecutive attempts.

**It did not reproduce.** Everything that can be tested off the live node is
clean. What this session produced is a much smaller suspect list and two
instruments that will catch it the next time it happens, because the evidence
from the first occurrence is gone.

## What the door actually logged

`/app/data/bbs/Doors/DoorRepo/DoorRepo.log` on live, 05:19 UTC:

```
DOWNLOAD MISMATCH archive=-D-CALC.LHA attempt=1 digest=sha256 computed=e44cef1b62b025dc4b60c412eefb48c1d890af42de13ba428dc815e13441ccb1 (retrying)
DOWNLOAD ABORT     archive=-D-CALC.LHA attempt=2 digest=sha256 computed=e44cef1b...
```

`computed=` is a digest of the bytes the door received, so the DOOR'S BYTES
were wrong - not the header it compared them against. And the door's
Content-Length check passed, so it received exactly 7943 bytes of the wrong
content: an in-place corruption, not a truncation or an overrun.

## Ruled out, with the measurement that ruled it out

| Suspect | Evidence |
|---|---|
| The server | `curl` from INSIDE the live container: 7943 bytes, sha `3ead6e6c...`, matching its own `X-Archive-SHA256`. |
| The archive changing under us | Live file mtime is **2026-06-02**, size 7943, md5 `9127e079`. Untouched for eleven weeks. |
| http.c / the sink / the hash | `tools/probe_fetch.c` (new) pulls the same URL through the same http.c+netio.c with no catalog and no UI. Native: correct. **Under this project's 68K emulator: also correct.** |
| The emulator's bsdsocket recv path | Same probe, same emulator, right digest. The previous session's conclusion that this was the culprit is not supported. |
| The door binary | The EXACT binary that failed (`git show 17b90db5f:Doors/DoorRepo/doorrepo.amiga`, md5 `4c69a426`) downloads and verifies `-D-CALC.LHA` correctly under the emulator, in both `Ansi=no` and `Ansi=yes`. |
| The ANSI browser path | Driven end to end (F -> filter -> R -> Y) with the full-screen browser: `DOWNLOAD OK ... sha256=3ead6e6c...`. |
| "It is some other archive's bytes" | `sha256sum` over all **3412** archives on live: nothing hashes to `e44cef1b`. |
| Chunk reordering, byte-swap, high-bit strip | Tested against the real bytes for the observed chunk splits (441/4096/3406 and 441/2560/4096/846) and every permutation: no match. |

vbcc builds reproducibly here: a fresh `make amiga` gives the same md5 as the
committed binary, so "which binary was live" is answerable from git.

**The forensics are gone.** The container was recreated at 08:10, ~3 hours
after the failure, so the emulator's own per-chunk logs died with it, and the
door deletes a mismatching download before retrying.

## What is left

The corruption happened inside the LIVE BBS's emulator instance under
conditions the standalone harness does not have: a real session, other nodes,
the same Node process both serving the HTTP response and running the emulator.
That is now the only place it can be, and the only way to see it is to be
recording when it next happens.

## Instruments built (both OFF by default)

**1. `BSDSOCKET_TEE_DIR` - byte capture at the emulator boundary.**
`web/backend/src/amiga-emulation/api/bsdsocket-tee.ts`. When the env var names
a directory, every socket a door opens gets two files:

- `*.wire.bin` - every Buffer node's socket delivered.
- `*.recv.bin` - every byte `recv()` copied into the door's memory.

Three comparisons, one reproduction: wire vs curl isolates network/server;
recv vs wire isolates the emulator; the door's own bytes vs recv isolates
everything above bsdsocket. All read paths (`recv`/`recvfrom`/`recvmsg`) funnel
through `BsdSocketLibrary.recv()`, so one hook covers them.

Tests: `web/backend/tests/amiga-emulation/bsdsocket-tee.test.ts` (5). The one
that matters drives a real socket through `recv()` in 500-byte bites against a
3 KB payload and asserts the capture equals what landed in the door's memory
byte for byte, ACROSS a partial chunk drain - verified to fail when the capture
records whole chunks instead of the copied prefix.

**2. `KeepFailedDownloads` - the door stops destroying the evidence.**
A mismatching download is renamed `<name>.bad` instead of deleted. Off by
default (a door that hoards corrupt archives on a sysop's disk is worse), any
previous `.bad` replaced so it cannot accumulate, and it falls back to deleting
if the rename fails. `flow_build_bad_path()` in flow.c, 4 tests; config key, 2
tests. Proven end to end against a stub server that serves bytes contradicting
its own `X-Archive-SHA256`: the file is kept, both attempts log, and the door's
computed digest equals the corrupt body exactly - which independently confirms
the door hashes what it receives.

**3. `tools/probe_fetch.c` + `make probe-native` / `make probe-amiga`.**
The head-less download probe. Keep it: it is how "is it the door or the
emulator" gets answered in one command instead of a driven session.

## To actually catch it

1. Deploy (not done - the changes are committed nowhere yet).
2. On live: `KeepFailedDownloads=yes` in `Doors/DoorRepo/DoorRepo.cfg`, and
   `BSDSOCKET_TEE_DIR=/app/data/bbs/T/tee` in the compose environment.
3. Have the user run DoorRepo and download `-D-CALC.LHA`.
4. If it fails: pull the `.bad` file and the two capture files, diff all three
   against curl's 7943 bytes. Turn both off again afterwards - the tee copies
   every byte every door downloads.

## Separate defect found on the way

`-D-CALC.LHA`'s catalog row is stale and always was: it says **10431 bytes /
md5 `0f7b2806`**, which is the pristine copy still sitting in
`~/Code/amiexpress_doors/Archives/AmiExpress/`. The live file has been the
stripped 7943-byte version since 2026-06-02. The indexer
(`dev/scripts/door-corpus/build-door-catalog.ts`) never re-described it, so the
door correctly prints its "the catalog digest is probably stale" note. This is
what made the row look implicated; it is not. Worth a sweep: any archive
modified after it was indexed carries a wrong size and md5 in `list.txt`.

Also noticed: `examples/doorrepo-c/DoorRepo.cfg.example` has its prose lines
WITHOUT a leading `#`. Copy it to `DoorRepo.cfg` and config_load skips (and
logs) every one of them. Left alone - the whole file is written that way, so
whether it is documentation or a copyable template is the owner's call.

## Verification state

- C suite: 209 flow / 123 config / 48 http / 33 aedoor and the rest - all
  green, zero warnings from clang `-Wall -Wextra -pedantic` and vbcc.
- Backend jest: 5167 passed. Four failures, all pre-existing and unrelated -
  three are load flakes that pass in isolation, and
  `tests/api/info-editor-routes.test.ts` "responds without crashing" times out
  at 30 s identically with the change stashed (this working tree has a very
  large untracked file set; `git status` alone takes 26 s).
- `npx tsc --noEmit`: clean.
