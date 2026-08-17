# DoorRepo C Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A complete, buildable AmiExpress door in C that browses the central door repo and downloads doors, for real 68K AmiExpress.

**Architecture:** Seven portable-C89 modules with exactly one `#ifdef AMIGA` file (`netio.c`). The door I/O layer adopts the AmiExpress author's own published glue. Native build runs the identical door logic over stdio+BSD sockets so everything except ~40 lines of Amiga socket glue is testable and runnable here.

**Tech Stack:** C89, vbcc 0.9hp3 (`vc +aos68k`) for m68k-amigaos, host `cc` for the native build, `bsdsocket.library` on Amiga.

**Spec:** `thoughts/shared/plans/2026-08-17-doorrepo-c-client-design.md` — read it; it records the platform ground truth and the honest verification split.

## Global Constraints

- **C89 only** in every module except where a native-only test helper needs more. No C99 declarations-after-statements, no `//` comments, no VLAs, no `stdint.h` (vbcc has it, but AmiTCP-era compilers may not — use explicit `unsigned long`/`unsigned char` typedefs in one header).
- **Exactly one platform-conditional file:** `netio.c`. Any other `#ifdef AMIGA` is a defect. `aedoor.c` gets TWO implementations selected by the Makefile (`aedoor_amiga.c` / `aedoor_native.c`) rather than in-file ifdefs.
- **Memory discipline (68020 target):** fixed buffers, streaming download to disk, no per-row allocation, hard cap on catalog rows with a clear message when exceeded. Never buffer an archive in RAM.
- **ASCII output only.** No ANSI escape sequences, no emojis. Full English words in user-facing strings.
- **Every user-facing string goes through `PutString`** so `CheckMessage()` keeps seeing carrier loss.
- Authoritative protocol sources, to be read not guessed: `/Users/spot/Code/amiexpress_doors/Sources/_C/AE_DOORS/AEDoor.c` (canonical glue) and `.../doordocs.txt` (964-line official protocol doc; `struct JHMessage`, `JH_LI=0`, `JH_REGISTER=1`, `JH_SHUTDOWN=2`, port `AEDoorPort<n>`, node number from `argv[1]`).
- Binding HTTP contract: `docs/DOOR-REPO-API.md`. Live base: `http://bbs.uprough.net`.
- Build commands (verified working on this machine):
  - native: `cc -std=c89 -Wall -Wextra -pedantic ...`
  - amiga: `export VBCC=/opt/homebrew/Cellar/vbcc/0.9hp3; export NDK=/opt/homebrew/Cellar/m68k-amiga-elf-gcc/13.1.0/m68k-amiga-elf/sys-include; vc +aos68k -c99 -I"$VBCC/targets/m68k-amigaos/include" -I"$NDK" <src> -o <out> -lauto`
  - (`-c99` is a vbcc flag name only; the SOURCE stays C89.)
- All files live under `examples/doorrepo-c/`. Commit by filename. COMMIT ONLY, never push.
- Tests: native, runnable via `make test`, no network for unit tests; the live-API run is a separate explicit target.

---

### Task 1: MD5 (streaming) with RFC 1321 vectors

**Files:** Create `examples/doorrepo-c/md5.c`, `md5.h`, `examples/doorrepo-c/tests/test_md5.c`

**Interfaces produced:** `void md5_init(md5_ctx *)`, `void md5_update(md5_ctx *, const unsigned char *, unsigned long)`, `void md5_final(md5_ctx *, unsigned char digest[16])`, `void md5_hex(const unsigned char digest[16], char out[33])`.

- [ ] **Step 1: Write the failing test** — assert all five RFC 1321 test vectors plus a chunked-update case proving streaming equals one-shot:

```c
/* "" -> d41d8cd98f00b204e9800998ecf8427e
   "a" -> 0cc175b9c0f1b6a831c399e269772661
   "abc" -> 900150983cd24fb0d6963f7d28e17f72
   "message digest" -> f96b697d7cb7938d525a2f31aaf161d0
   "abcdefghijklmnopqrstuvwxyz" -> c3fcd3d76192e4007dfb496cca67e13b */
```
Also: feed "abc" as "a","b","c" via three `md5_update` calls and assert the same digest.

- [ ] **Step 2: Run, verify it fails** — `make test` → link error / no such file.
- [ ] **Step 3: Implement** RFC 1321 MD5 in C89 with a typedef header for fixed-width types (`typedef unsigned long md5_u32;` masked to 32 bits — do NOT assume 32-bit `unsigned long`; mask with `& 0xFFFFFFFFUL` where it matters, since this must be correct on a 68K where `long` is 32-bit and on a modern 64-bit host).
- [ ] **Step 4: Run, verify PASS** (all six assertions).
- [ ] **Step 5: Commit** `git add examples/doorrepo-c/md5.c examples/doorrepo-c/md5.h examples/doorrepo-c/tests/test_md5.c && git commit -m "feat(doorrepo-c): streaming MD5 with RFC 1321 vectors"`

---

### Task 2: list.txt parser

**Files:** Create `listtxt.c`, `listtxt.h`, `tests/test_listtxt.c`

**Interfaces produced:**
- `typedef struct { char archive[64]; char type[8]; unsigned long size; char md5[33]; char name[64]; char desc[128]; } dr_entry;`
- `int listtxt_parse_header(const char *line, int *format_version, char *revision, unsigned long revlen, unsigned long *count)` — returns 0 on success.
- `int listtxt_parse_row(const char *line, dr_entry *out)` — returns 0 on success; tolerates EXTRA trailing fields (append-only promise) and short/empty fields.

**Consumes:** nothing (pure).

- [ ] **Step 1: Failing tests**, using real shapes from the live endpoint:
  - header `DOORREPO|1|a2d8b215ec846fc13b80cb037b9df0c541b848fc|3301` → version 1, that revision, 3301.
  - row `ABS-PLC2.LHA|DD|28272|715de1907a9cb4a3fadd3aea6bbd875f|Name|Desc` → every field.
  - row with an EMPTY md5 field (`...|28272||Name|Desc`) → parses, `md5[0]=='\0'`.
  - row with SEVEN fields (a future appended field) → parses the six known, ignores the extra.
  - row with a `!` where a pipe was escaped → the `!` is literal (we do not unescape; document that).
  - malformed row (two fields) → non-zero return, no partial write past the struct.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** with bounded copies only (`strncpy` + explicit NUL, or a local `copy_field` helper). No `strtok` on the caller's buffer (it must accept `const char *`).
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** `feat(doorrepo-c): list.txt parser tolerant of appended fields`

---

### Task 3: Config file

**Files:** Create `config.c`, `config.h`, `tests/test_config.c`, `DoorRepo.cfg.example`

**Interfaces produced:** `typedef struct { char host[64]; int port; char path[128]; char download_dir[128]; int page_size; int timeout_secs; char lha_command[128]; int extract_after_download; char log_file[128]; } dr_config;` plus `void config_defaults(dr_config *)` and `int config_load(dr_config *, const char *path)` (missing file = defaults, returns 0; malformed line = skipped with a count returned via an out-param).

Defaults: host `bbs.uprough.net`, port 80, path `/api/door-repo`, download dir `T:`, page size 20, timeout 30, lha command `lha`, extract 0, log `T:DoorRepo.log`.

- [ ] **Step 1: Failing tests** — defaults applied when the file is absent; `KEY=VALUE` parsed for every key; `#` comments and blank lines ignored; unknown key skipped and counted; a value longer than its buffer is truncated safely with NUL termination; `ExtractAfterDownload=yes|no|1|0` all map correctly.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(doorrepo-c): configuration file with safe defaults`

---

### Task 4: netio (the only platform-conditional file) + HTTP client

**Files:** Create `netio.c`, `netio.h`, `http.c`, `http.h`, `tests/test_http.c`, `tests/stub_server.c`

**Interfaces produced:**
- `netio.h`: `int net_open(const char *host, int port, int timeout_secs)`, `long net_write(int, const void *, unsigned long)`, `long net_read(int, void *, unsigned long)`, `void net_close(int)`, `const char *net_last_error(void)`.
- `http.h`: `typedef struct { int status; unsigned long content_length; int have_content_length; char md5[33]; char sha256[65]; char revision[48]; } http_response;` and
  `int http_get(const dr_config *cfg, const char *path_and_query, http_response *resp, int (*sink)(void *ctx, const unsigned char *buf, unsigned long len), void *ctx)` — streams the body through `sink`; `sink` returning non-zero aborts.

**Requirements:**
- HTTP/1.1 request with `Host:`, `Connection: close`, and a `User-Agent` naming the door and version.
- Parse status line and only the headers in `http_response`; ignore the rest.
- **Reject `Transfer-Encoding: chunked`** with a distinct error (the API documents it never chunks) rather than mis-parsing.
- Read until EOF when `Connection: close` (that is the body end), but if `Content-Length` was present, verify the byte count and report a mismatch as an error.
- Amiga branch: `OpenLibrary("bsdsocket.library", 4)`, `socket/connect/send/recv/CloseSocket`, `gethostbyname`, `errno` via `Errno()`; library opened once and closed on exit. Native branch: POSIX sockets + `getaddrinfo`.
- Timeouts on connect and on each read.

- [ ] **Step 1: Failing tests** driven by a tiny native stub server (fork/thread, ephemeral port): 200 with `Content-Length` and a body → status, length, body bytes via sink; 404 → status 404, no sink calls required to succeed; missing `Content-Length` with `Connection: close` → body still delivered; `Transfer-Encoding: chunked` → distinct error, no body; header extraction of `X-Archive-MD5`/`X-Door-Repo-Revision`; sink returning non-zero → `http_get` aborts and reports it; connect to a closed port → clean error, no crash.
- [ ] **Step 2: FAIL. Step 3: Implement both branches** (Amiga branch compiled only in the amiga target; keep it under 60 lines and mirror the native logic exactly). **Step 4: PASS natively.**
- [ ] **Step 5: Commit** `feat(doorrepo-c): streaming HTTP client over a portable socket layer`

---

### Task 5: AmiExpress door I/O layer, both implementations

**Files:** Create `aedoor.h`, `aedoor_amiga.c`, `aedoor_native.c`, `tests/test_aedoor_native.c`

**Read first (authoritative, do not guess):** `/Users/spot/Code/amiexpress_doors/Sources/_C/AE_DOORS/AEDoor.c` and `doordocs.txt` in the same directory. Match the author's semantics and keep his function names where they fit; credit the source in a header comment.

**Interfaces produced:** `int  ae_start(int node)` (PortStart equivalent; 0 on success), `void ae_put(const char *text, int newline)` (PutString), `void ae_get(char *buf, int maxlen)` (GetString), `int  ae_check(void)` (CheckMessage: returns non-zero when the BBS asked us to stop / carrier lost), `void ae_shutdown(void)`, `void ae_fatal(int code)` (TakeOffEh).

**Requirements:**
- `struct JHMessage` declared exactly per `doordocs.txt`: `struct Message Msg; char String[200]; int Data; int Command; int NodeID; int LineNum; unsigned long signal; struct Process *task; APTR Semi;`
- Commands per the doc: `JH_LI=0`, `JH_REGISTER=1`, `JH_SHUTDOWN=2`, plus the write/read codes the doc lists — take every value from the doc, and put the doc's line reference in a comment beside each.
- Port name `AEDoorPort<node>`; node from `argv[1]`.
- Strings longer than the 200-byte `String` buffer must be split across multiple sends, not truncated (long descriptions will hit this).
- `aedoor_native.c` implements the same six functions over stdio: `ae_put` writes to stdout, `ae_get` reads a line from stdin, `ae_check` returns 0, `ae_start`/`ae_shutdown` are no-ops. This is what makes the whole door runnable and testable here.

- [ ] **Step 1: Failing tests** for the native implementation: `ae_put` with and without newline; `ae_get` truncates safely at `maxlen`; a >200-char string passed to `ae_put` is emitted in full (the splitting rule, verified on the native side where we can capture output).
- [ ] **Step 2: FAIL. Step 3: Implement both.**
- [ ] **Step 4: PASS natively, AND compile `aedoor_amiga.c` with the vbcc command from Global Constraints** — it must produce an AmigaOS loadseg()ble object/binary. Paste the compiler output in the report.
- [ ] **Step 5: Commit** `feat(doorrepo-c): AmiExpress door I/O layer with native stdio twin`

---

### Task 6: The door itself + Makefile

**Files:** Create `doorrepo.c`, `Makefile`, `tests/test_flow.c`

**Consumes:** every module above.

**Requirements — the full flow from the spec:**
1. `ae_start(atoi(argv[1]))`, config load, banner with door name/version.
2. Catalog fetch with revision-based caching: fetch `list.txt`, compare its header revision to the cached file's; reuse cache when equal. Cache path derived from config (`DownloadDir`).
3. Paged browse: index, archive, type, size (right-aligned KB), name. Keys `N`/`P`/number/`T`/`S`/`A`/`Q` exactly as the spec lists. Re-fetch server-side for `T` (`?type=`) and `S` (`?q=`).
4. Entry view with full description; `D` download, `Q` back.
5. Download: streamed to `<DownloadDir>/<archive>`, progress every 8 KB via `ae_put`, MD5 computed during the stream, `Content-Length` verified.
6. Verify MD5 against the listing; on mismatch delete, report both digests, retry once, then stop with the stale-digest explanation from the API doc.
7. Optional `lha` extraction when configured; report result.
8. Append a line to the log for each download and its verification outcome.
9. `ae_check()` polled in every input loop; clean `ae_shutdown()` on exit, `ae_fatal()` on fatal paths.
10. Hard cap on rows (e.g. 4096) with a clear message when the catalog is larger.

**Makefile targets:** `native` (all modules + `aedoor_native.c`), `amiga` (all modules + `aedoor_amiga.c`, using the verified vbcc invocation, with `NETINCLUDE?=` documented for the AmiTCP SDK), `test` (unit tests), `live` (native binary against `http://bbs.uprough.net`, explicitly network-touching), `clean`.

- [ ] **Step 1: Failing tests** for the pure decision logic extracted from the flow — pagination maths (first/last page, partial final page, page size 1), the mismatch-retry state machine (first mismatch retries, second aborts), and filter/search query-string construction (URL-encoding of a search term, `&` in an archive name left unencoded per the API doc).
- [ ] **Step 2: FAIL. Step 3: Implement door + Makefile. Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(doorrepo-c): browse, download and verify flow with Makefile`

---

### Task 7: End-to-end verification and README

**Files:** Create `README.md`; modify nothing else except fixes the verification forces.

- [ ] **Step 1: Native live run** — `make live`, then drive it: browse, filter to `DD`, search, open an entry, download a real archive, watch MD5 verification pass. Capture the actual terminal transcript.
- [ ] **Step 2: m68k build** — `make amiga` with the documented env. If it fails ONLY inside `netio.c`'s Amiga branch for missing AmiTCP headers, that is the expected and documented outcome: build the same target with `NETIO_STUB=1` (add that switch) to prove every other module compiles and links to an AmigaOS binary, and record both outcomes verbatim.
- [ ] **Step 3: Emulator run** — install the m68k binary as an XIM door in amiexpress-web (`Commands/BBSCmd/*.info` with `TYPE=XIM`, `LOCATION=` the binary; follow how existing XIM doors are registered) and run it. Confirm `PortStart`/`PutString`/`GetString` work against our emulator and that the network call fails with the clear message from Task 4. Capture the door log.
- [ ] **Step 4: Write `README.md`** — what it is; build for native and Amiga (exact commands, `NETINCLUDE`); the honest verification table from the spec including what was NOT verified and why; config reference; how to replace the door layer; the API's append-only promise and where the contract lives; credit to `AEDoor.c`/`doordocs.txt`.
- [ ] **Step 5: Commit** `docs(doorrepo-c): README with build instructions and verification status`

---

## Self-review notes (done at write time)

- Spec coverage: all seven spec modules have a task; the spec's verification table maps to Task 7's three steps plus per-task unit tests; the spec's non-goals are respected (no admin, no HTTPS, no JSON, extraction optional and off by default).
- Type consistency: `dr_entry` (T2) is consumed by T6; `dr_config` (T3) by T4 and T6; `http_response`/`sink` (T4) by T6; the six `ae_*` functions (T5) by T6 and nothing else.
- The one real risk is stated rather than hidden: the Amiga socket branch cannot be compiled here, so T7 Step 2 defines exactly what "as verified as possible" means and requires both outcomes recorded verbatim.
