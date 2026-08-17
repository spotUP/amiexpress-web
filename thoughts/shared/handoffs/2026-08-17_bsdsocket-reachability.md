---
date: 2026-08-17
topic: bsdsocket follow-ups made reachable — getdtablesize, classic BSD errno, gethostbyname literals
tags: [handoff, bsdsocket, emulator, doorrepo-c, 68k, amiga, reachability]
status: final
---

# Session handoff — 2026-08-17 (later) — bsdsocket reachability

Continuation of `2026-08-17_doorrepo-c-and-door-repo-api.md`, which left two
one-line bsdsocket follow-ups open. Both are done, and both are now proven by
running the real m68k `doorrepo.amiga` binary inside our own emulator rather
than by unit tests alone. Nothing is mid-flight.

Commits: `24028ea09`, `3e05f5de9`, `805c1aa9b` (plus `5aed1029e`, a handoff
trim).

## What changed

**1. `getdtablesize()` reported 256; the real ceiling is 32** (`24028ea09`).
`socket()` refuses to allocate at or above `BSD_FD_SETSIZE`, so a door sizing
its own bookkeeping from `getdtablesize()` was told it could open 8x more
sockets than it can and would hit an unexpected `-1/EMFILE` at the 33rd. Now
returns `BSD_FD_SETSIZE`.

**2. `ECONNREFUSED`/`ETIMEDOUT` carried the Linux errno numbers** (`24028ea09`).
They are 111/110 on Linux and **61/60** in classic BSD/AmigaOS. A 68K door
compares against the constants it compiled against, so every
`if (errno == ECONNREFUSED)` in every network door was silently false. Values
were not guessed — they were read from the vendored Roadshow NDK header,
`Documentation/7-Reference Sources/NDK3.2R4/SANA+RoadshowTCP-IP/netinclude/sys/errno.h`
lines 74 / 99 / 147 / 148. `ENOENT 2` and `EMFILE 24` were already right, which
is exactly why the bug hid: those two agree across both numberings.

**3. `gethostbyname()` was DNS-only** (`3e05f5de9`). It used `dns.resolve4()`,
which only ever asks a DNS server. Real AmiTCP/Roadshow resolves a dotted-quad
literal through `inet_addr()` and consults the hosts file before any DNS
traffic, so `192.168.0.10` and `localhost` — the two things a sysop is most
likely to type into a door config — both failed here while working on a real
Amiga. Now `dns.lookup()`. **Found only by running the door**, when pointing
`RepoHost` at a local address to test the errno path.

**4. DoorRepo now exercises 1 and 2** (`805c1aa9b`). `netio.c`'s Amiga branch
sizes the single-`long` `WaitSelect()` fd_set from `getdtablesize()`, clamps
that to the mask width, and refuses a descriptor it cannot represent instead of
waiting forever on a bit that is not there. Both branches map the `connect()`
errno to refused / timed out / network unreachable / no route instead of
folding all four into "connect() failed", and `doorrepo.c` surfaces
`net_last_error()` in the user-visible failure so a sysop can tell a closed
port from a black hole.

## How it was proven (this is the part worth keeping)

Unit tests alone would not have been worth much here — before this work, **no
door in any log had ever called `getdtablesize()` or `Errno()`**. So the door
was extended to call them and the binary was run:

- Against the live API, emulator trace:
  `Created socket fd=0` → `getdtablesize() - returning 32` → `connect(fd=0, 89.167.21.154:80)`,
  on both HTTP requests.
- Against a closed port: the door printed
  `Could not reach the door repository server (netio: connect() refused).`
- **Negative control:** emulator `ECONNREFUSED` reverted to the Linux 111, same
  run, same everything else → `(netio: connect() failed)`. Without this step
  the previous bullet proves nothing; with it, the message is demonstrably
  driven by the errno comparison.

8 regression tests added across
`web/backend/tests/amiga-emulation/bsdsocket-fd-numbering.test.ts` and
`examples/doorrepo-c/tests/test_http.c`; every one was watched failing against
the pre-fix code.

## Gotchas discovered, so nobody re-pays for them

- **`run-amiga-door.ts` hangs with no output unless `SKIP_DB_INIT=1` is set**
  when a dev backend is already running. It emits two `[DoorLogger]` lines and
  then stalls forever. Full working invocation:
  ```
  SKIP_DB_INIT=1 SKIP_NETWORK_LISTENERS=1 DEBUG_68K=1 \
    timeout 60 npx tsx web/backend/src/scripts/run-amiga-door.ts \
    Doors/DoorRepo/doorrepo.amiga 1 --doortype XIM --command DOORREPO \
    --timeout 40 </dev/null >out.txt 2>err.txt
  ```
  `DEBUG_68K=1` is required to see `[BsdSocketLibrary]` lines at all.
- **`grep` in this shell is `ugrep`.** It silently finds nothing on some
  patterns against these logs and chokes on high-bit bytes
  (`tr: Illegal byte sequence`). Use `LC_ALL=C grep -a` for anything touching
  emulator logs or Amiga headers, or results will be false negatives — this
  cost real time twice in one session.
- **Delete `/tmp/listtxt.cache` between DoorRepo runs.** With a cache present
  the door reports "using the cached catalog from a previous run" and never
  reaches the network error path being tested.
- `DoorRepo.cfg` is read relative to the door's directory
  (`Doors/DoorRepo/DoorRepo.cfg`). Do not leave a test one committed.
- The macOS closed-port path goes through `getsockopt(SO_ERROR)`, not the
  synchronous `errno` branch; the emulator's `connect()` is synchronous and
  takes the other one. A revert-check that patches only one of the two
  `fail_reason` assignments will pass on broken code — it did, first try, and
  that is what §3 of the reachability protocol is for.

## Non-blocking connect — the standard AmigaOS idiom now actually works

`IoctlSocket(FIONBIO)` was discarded on the reasoning that node sockets are
already non-blocking. But a door does not see node's sockets; it sees
`connect()`, which blocked regardless, for up to 30 seconds. So a door that
set `FIONBIO` **precisely so it could impose its own connect timeout** — the
standard AmigaOS sequence: non-blocking `connect` → `WaitSelect` with a
`timeval` → `getsockopt(SO_ERROR)` — had that timeout silently ignored and
stalled the whole emulator with it. `getsockopt()` was a stub that returned 0
and wrote nothing, so a door could not have distinguished a connected socket
from a failed one even if it got that far.

Now implemented end to end:

- `IoctlSocket(FIONBIO)` is honoured (request value `0x8004667e`, computed from
  `sys/filio.h:87`'s `_IOW('f', 126, long)` and confirmed against the value a
  real door actually sent).
- `connect()` on a non-blocking socket returns `-1`/`EINPROGRESS` (36)
  immediately.
- `WaitSelect()` reports the socket writable on **failure as well as** success
  — that is how BSD signals it, and waking only on success would leave a
  refused connection blocked until the door's own timeout.
- `getsockopt(SOL_SOCKET, SO_ERROR)` returns the pending error and clears it,
  per `socket.h:145` ("get error status and clear").
- `connectSync()`'s flat `ECONNREFUSED` for every failure is gone; both paths
  share one Node-errno→Amiga-errno mapper, so a host-unreachable is no longer
  misreported as "connection refused".
- `netio.c`'s Amiga branch checks `SO_ERROR` after the wait, as the POSIX
  branch always did.

Blocking behaviour is unchanged for any door that does not set `FIONBIO`, and
a test pins that.

Proven with the real m68k binary, live API:

```
getdtablesize() - returning 32
IoctlSocket(fd=0, FIONBIO, 1) -> nonBlocking=true
connect: non-blocking, returning -1/EINPROGRESS
WaitSelect returning 1
getsockopt(fd=0, SO_ERROR) = 0
```

and against a closed port, `getsockopt(fd=0, SO_ERROR) = 61` → the door prints
`(netio: connect() refused)`. That also made the door's own new `SO_ERROR`
check reachable — it was dead code while `connect()` was synchronous.

Red-check: 4 of the 5 new tests fail with `FIONBIO` discarded and `getsockopt`
stubbed; the 5th is the control that must pass either way, and does. In the
pre-fix run the two failing wait tests take 5.1s and 5.9s — that is the hang,
visible in the timings.

## CI — jest now runs on every push

`.github/workflows/backend-tests.yml` added. Nothing in CI ran jest before:
the disabled `door-ci.yml.disabled` runs `npm run door:ci` (doctor + fixture
harness), not the suite — so re-enabling it would not have covered any of
this. The new workflow runs `tsc --noEmit` plus the full jest suite, and a
second job runs the DoorRepo C suite (`make test`, no deps beyond a host `cc`).

**Two things previously believed about the suite are wrong, and the quickref
said so:**

- It does **not** OOM. A full run is 268 suites / ~5090 tests in 40-75 seconds.
- `SKIP_DB_INIT=1` must **not** be used for a full run. It is for targeted
  emulator suites; applied to everything it disables the test database the
  ~39 database suites need and manufactures ~344 failures. The first
  measurement this session was invalid for exactly that reason.

Known flake, pre-existing and unrelated: `tests/api/info-editor-routes.test.ts`
failed once under full-suite parallel load with `process.exit called with "1"`,
and passes in isolation. It is an HTTP-route suite; nothing in it touches
bsdsocket.

## What is worth doing next

- **Send DoorRepo to the AmiExpress author.** `examples/doorrepo-c/README.md`
  is written for him; `docs/DOOR-REPO-API.md` is the contract. Unchanged from
  the previous handoff, still the top item.
- **`.github/workflows/door-ci.yml.disabled`** — nothing runs jest, so all of
  the above regression tests are manual-only. User's call; the `.disabled`
  suffix looks deliberate.
- ~~Not fixed: the emulator's `connect()` never yields `EINPROGRESS` / the
  Amiga branch does not check `SO_ERROR`.~~ **Both fixed later the same day —
  see the "Non-blocking connect" section below.**
- Live `DEBUG_68K=1` is still ON in `/app/amiexpress/docker-compose.yml`.
- Still unverified by the user: DD door type-ahead; the sysop page-accept chat
  flow; the 19 DayDream doors live at ACCESS=0.
