---
date: 2026-08-17
topic: DoorRepo - full-featured reference door in C for real 68K AmiExpress
tags: [design, spec, door-repo, 68k, amiga, c, vbcc]
status: draft
---

# DoorRepo: reference AmiExpress door in C

A complete, buildable door that lets a sysop on REAL 68K AmiExpress browse the
central door repo and download doors from it. Written to be handed to the
original AmiExpress author as a working starting point, not a toy.

Binding API contract: `docs/DOOR-REPO-API.md` (live at
`http://bbs.uprough.net/api/door-repo/`, plain HTTP, read-only).

## Non-goals

- No repo administration of any kind (the API has no write endpoints).
- No HTTPS (would require AmiSSL; plain HTTP is a first-class supported path).
- No JSON: the door uses `list.txt`, which exists precisely so a C client
  needs no JSON parser.
- No `Doors/` install-into-BBS automation beyond optional LHA extraction into
  a sysop-chosen directory. Wiring a door into the BBS config stays manual.

## Platform ground truth (verified on this machine, 2026-08-17)

- **Canonical door glue exists and must be adopted, not invented:**
  `/Users/spot/Code/amiexpress_doors/Sources/_C/AE_DOORS/AEDoor.c` (282 lines)
  provides `PortStart()`, `CheckMessage()`, `GetString(text,len)`,
  `PutString(text,lf)`, `ShutDown()`, `TakeOffEh(code)`, using port name
  `AEDoorPort<n>` with the node number from `argv[1]`. Official protocol
  documentation sits beside it: `doordocs.txt` (964 lines). The author wrote
  these; matching them is what makes this door recognisable to him.
- **Compiler:** vbcc 0.9hp3 (`vc +aos68k`), with `VBCC` exported and NDK
  headers supplied via `-I`. Confirmed producing a real
  "AmigaOS loadseg()ble executable" from AEDoorPort-style code using
  `exec/ports.h`, `proto/exec.h`, `proto/dos.h`.
- **NDK headers available here:**
  `/opt/homebrew/Cellar/m68k-amiga-elf-gcc/13.1.0/m68k-amiga-elf/sys-include`
  (has `exec/`, `dos/`, `clib/`, `proto/`).
- **What CANNOT be compile-verified here:** the bsdsocket branch. vbcc ships
  `proto/socket.h` + `inline/bsdsocket_protos.h` but not the AmiTCP SDK's
  `sys/socket.h` / `netinet/in.h` / `netdb.h`; the gcc tree's copies assume a
  different libc and fail under vbcc. Hand-declaring those structs would risk
  an untestable ABI mismatch, so we will not fake it: the Amiga socket branch
  is written against the documented bsdsocket API, isolated in one file, and
  the Makefile takes a `NETINCLUDE=` pointing at the builder's own SDK.
- `m68k-amiga-elf-gcc` is unsuitable (no hosted libc: no `stdlib.h`).

## Architecture

Seven modules. Exactly one is platform-conditional; everything else is
portable C89 so it can be unit-tested and run natively.

| File | Responsibility |
|---|---|
| `aedoor.c/.h` | AmiExpress door I/O: the canonical six functions, adapted from the author's `AEDoor.c` with attribution. Amiga build talks `AEDoorPort<n>`; native build implements the same six functions over stdio so the whole door is runnable on a desktop. |
| `netio.c/.h` | THE ONLY `#ifdef AMIGA` file. `net_open(host,port)`, `net_write`, `net_read`, `net_close`. Amiga: `bsdsocket.library`. Native: BSD sockets. |
| `http.c/.h` | HTTP/1.1 GET with `Connection: close`. Parses status line and the headers we care about (`Content-Length`, `X-Archive-MD5`, `X-Archive-SHA256`, `X-Door-Repo-Revision`). **Streams** the body to a callback -- archives are never held in RAM. Rejects `Transfer-Encoding: chunked` with an explicit error (the server documents that it never chunks). |
| `listtxt.c/.h` | Pure parser: header line `DOORREPO\|<ver>\|<revision>\|<count>` and data rows `archiveName\|doorType\|archiveSize\|md5\|name\|description`. Tolerates extra trailing fields (the append-only promise). No I/O. |
| `md5.c/.h` | RFC 1321 MD5, streaming (`md5_init/update/final`), verified against the standard test vectors. |
| `config.c/.h` | `KEY=VALUE` config file + defaults. Keys: `RepoHost`, `RepoPort`, `RepoPath`, `DownloadDir`, `PageSize`, `TimeoutSecs`, `LhaCommand`, `ExtractAfterDownload`, `LogFile`. |
| `doorrepo.c` | The door: the flow below. |

Memory discipline (this runs on a 68020 with real constraints): fixed-size
buffers, streaming download straight to disk, catalog held as one allocation
plus an index array, no per-row mallocs, and a hard cap on catalog rows with a
clear message if exceeded.

## Door flow

1. `PortStart()` against `AEDoorPort<argv[1]>`; bail cleanly if absent.
2. Load config; announce name/version.
3. Catalog: if a cached `list.txt` exists, fetch only the header line first
   (`Range`-free: fetch and compare the revision on the first line) and reuse
   the cache when the revision matches; otherwise fetch fully and cache.
   Update detection uses the header revision, exactly as the API doc
   prescribes -- no ETag handling needed for the plaintext endpoint.
4. Browse: paged list (default 20 rows) showing index, archive name, type,
   size, name. Keys: `N`ext, `P`revious, number to view an entry, `T` filter
   by system type (server-side `?type=`), `S` search (server-side `?q=`),
   `A` show all, `Q`uit. Every prompt goes through `PutString`/`GetString`,
   so `CheckMessage()` still sees carrier loss and shutdown requests.
5. Entry view: full metadata plus description; `D` to download, `Q` back.
6. Download: `GET /api/door-repo/archive/<name>` streamed to
   `<DownloadDir>/<name>`, progress line every 8 KB, `Content-Length`
   compared against bytes written.
7. Verify: MD5 computed while streaming, compared with the listing's digest.
   On mismatch: delete the file, report both digests, retry once, and on a
   second mismatch stop and tell the sysop it may be a stale server-side
   digest (per the API doc's Digest freshness section) rather than looping.
8. Optional extract: if `ExtractAfterDownload=yes`, run `LhaCommand` via
   `SystemTags`/`Execute` into a subdirectory and report the result. Off by
   default -- the sysop decides where doors land.
9. Log every download and verification result to `LogFile`.
10. `ShutDown()` on exit; `TakeOffEh()` on any fatal path.

## ASCII only

Plain ASCII output, no ANSI sequences: a real AmiExpress user may be on an
ASCII-only terminal, and the BBS owns colour. Fixed-width columns via padding.

## Verification plan (what is actually provable, and where)

| Layer | How it is verified |
|---|---|
| `listtxt`, `md5`, `config` | Native unit tests. MD5 against RFC 1321 vectors; parser against real bytes captured from the live `list.txt`, including a `\|`-escaped name and a truncated description. |
| `http` response parsing | Native tests against a local stub server: status codes, missing `Content-Length`, chunked rejection, header extraction. |
| Whole-door flow | Native build run against the **live API**: browse, filter, search, download a real archive, MD5 verified. This is the primary end-to-end proof. |
| m68k compilability | `vc +aos68k` compile of every module except `netio.c`'s Amiga branch, with the NDK include path above. Must produce an AmigaOS loadseg()ble binary. |
| Amiga door I/O | Install the m68k binary in amiexpress-web as an XIM door and run it. Our emulator implements `AEDoorPort`, so `PortStart`/`PutString`/`GetString` are genuinely exercised. It has no `bsdsocket.library`, so network calls fail there -- that path must fail with a clear message, which is itself the error-path test. |
| Amiga socket branch | NOT verifiable here (no AmiTCP SDK). Written against the documented bsdsocket API, isolated in `netio.c`, `NETINCLUDE=` documented in the README and stated plainly as unverified in both README and handoff. |

## Deliverables

`examples/doorrepo-c/` containing the seven modules, `Makefile` (targets
`native`, `amiga`, `test`), `DoorRepo.cfg.example`, and `README.md` covering:
build for both targets, the `NETINCLUDE` requirement and why, what is verified
vs not, how to swap the door layer, and the API's stability promise.
