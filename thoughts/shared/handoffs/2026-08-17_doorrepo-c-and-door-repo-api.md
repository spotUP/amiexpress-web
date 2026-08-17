---
date: 2026-08-17
topic: Door repo API live; DoorRepo reference door in C complete and emulator-verified; DOORMAN filter arc closed
tags: [handoff, door-repo, api, doorrepo-c, 68k, amiga, doorman, bsdsocket, sdd]
status: final
---

# Session handoff — 2026-08-17 — door repo API + DoorRepo C door

Three bodies of work, all complete and pushed. Nothing is mid-flight; there
are no running agents and no uncommitted work of mine. Head at handoff:
`44357cf22`.

## HOW TO RESUME

There is no interrupted task. Pick up from "What is worth doing next" below.
Ledgers, if you need the full decision trail:

- `.superpowers/sdd/2026-08-17-door-repo-api/progress.md` — the API plan
- `.superpowers/sdd/2026-08-17-doorrepo-c-client/progress.md` — the C door
  plan, including every security round and ruling
- Per-task reports sit beside each ledger (`task-N-report.md`)

## 1. Central door repo API — LIVE

Read-only HTTP API so any amiexpress-web BBS, and real 68K AmiExpress, can
browse and install from one central catalog. Owner curates via git; there are
no write endpoints.

- Live: `http://bbs.uprough.net/api/door-repo/{manifest,list.txt,archive/<name>,health}`
  (plain HTTP deliberately — classic Amiga TCP stacks cannot do TLS; HTTPS
  also works)
- Public contract: `docs/DOOR-REPO-API.md` (byte-exact `list.txt` spec, real
  captured examples, archive-name quoting, append-only versioning promise,
  digest-freshness semantics)
- Design: `thoughts/shared/plans/2026-08-17-door-repo-central-api-design.md`
- Plan: `thoughts/shared/plans/2026-08-17-door-repo-api.md`

**Operational facts that will bite if forgotten:**

- The router is **gated on `DOOR_REPO_ROLE=owner`**. That value lives in
  `/app/amiexpress/.env` on the live host. Do NOT put it in the compose
  `environment:` block — a bare `- DOOR_REPO_ROLE` entry resolves to an empty
  string when unset in the deploying shell, and `environment:` shadows
  `env_file`. That exact mistake took the API offline once this session
  (commit `59e538cba` removes the trap; `deploy/README.md` documents it).
- After changing that variable the container must be **recreated**
  (`docker compose up -d`), not restarted.
- Plain HTTP works because of a host-side **Caddy** exemption applied this
  session (`/etc/caddy/Caddyfile`, backup `Caddyfile.bak-doorrepo-20260817-102750`).
  Deploys do not manage that file. The `handle`-based form is required;
  a `redir`-based version is wrong because Caddy sorts `redir` before `handle`.
- Catalog data: `door_type` re-typed and the ~89 never-indexed
  `Archives/DayDream/` archives indexed, so DOORMAN's system filter has a real
  DD bucket. Live counts DD 10 / SIM 14 / FIM 67 / XIM 3201, total 3301.
  Live DB merged via an **ATTACH staging database** — never text-dump this
  catalog to SQL, `doc_raw` carries control bytes.

## 2. DoorRepo — reference door in C for real 68K AmiExpress — COMPLETE

`examples/doorrepo-c/` — 4,772 lines of C89 across 18 files, 336 test
assertions green, plus `README.md` written for the external integrator.

Built for the original AmiExpress author to use as a starting point. It
adopts **his own published glue** (`AEDoor.c` / `doordocs.txt` in
`/Users/spot/Code/amiexpress_doors/Sources/_C/AE_DOORS/`) rather than an
invented door layer.

Modules: `md5` (streaming, RFC 1321 vectors), `listtxt` (parser), `config`,
`netio` (the ONLY platform-conditional file), `http` (streaming client),
`aedoor_amiga.c` / `aedoor_native.c` (door I/O plus a stdio twin so the whole
door runs on a desktop), `doorrepo.c` + `flow.c` (the door), `Makefile`
(`native`, `amiga`, `amiga-stub`, `test`, `live`, `clean`).

**Verification actually achieved** (stronger than the plan predicted):

- Unit-tested and native-run against the live production API.
- `make amiga` **compiles AND links** a real AmigaOS executable against the
  NDK vendored at `Documentation/7-Reference Sources/NDK3.2R4/`. `NETINCLUDE=`
  remains an override but is NOT required. Include order is load-bearing and
  is baked into the Makefile: the vendored `devices/timer.h` must precede the
  m68k-amiga-elf-gcc copy, which uses a C11 anonymous union that breaks vbcc.
- **The unchanged m68k binary ran end-to-end twice inside our own emulator**:
  `JH_REGISTER`, live 3301-row catalog fetched over `bsdsocket.library`,
  paging, `DD` type filter, search, archive download, MD5 verified
  (independently re-hashed, exact match), clean `JH_SHUTDOWN`, exit 0. It is
  installed as a working XIM door: `Commands/BBSCmd/DOORREPO.info` +
  `Doors/DoorRepo/doorrepo.amiga`.
- Still unproven: real Amiga hardware and a real AmigaOS TCP stack (AmiTCP /
  Roadshow / Miami). The README says so plainly.

**Protocol reference produced along the way:**
`thoughts/shared/research/2026-08-17_xim-door-protocol-for-c-clients.md` —
the exact wire protocol a C door must implement, extracted from the original
E sources, our emulator and real doors. It corrected a live bug in the plan
before code was written: `struct JHMessage` is **264 bytes (0x108)**, not the
248 that stopping at `Semi` would give, and the BBS writes `NodeID`/`LineNum`
with no length guard, so a short allocation is written past. A compile-time
assertion now enforces 264 — as a **negative-width bitfield**, because under
vbcc a negative *array* size is only a warning with exit 0.

**Four distinct vulnerability classes were found and closed by adversarial
review**, none sharing a code path with the previous one. Worth reading if you
touch this door:

1. Shell injection via sysop config (`DownloadDir` into `system()`).
2. Denylist bypass — `LhaCommand=touch /tmp/PWNED #`, an unquoted position
   plus a `#` comment. **Denylists lost twice; `LhaCommand` is now an
   allowlist** (single token, `[A-Za-z0-9_.:/-]`, no whitespace).
3. Path traversal via a server-supplied archive name, needing **zero** shell
   metacharacters. Archive names are now validated as filenames by a
   **separate** predicate from shell safety — conflating them is how this
   survived two security rounds.
4. Unbounded response bodies (resource exhaustion), severity-amplified
   because `DownloadDir` defaults to `T:`, conventionally a RAM disk on
   AmigaDOS. Both paths are byte-capped now; the archive ceiling is clamped
   so a hostile catalog cannot inflate its own limit.

Accepted exposure, deliberately: ANSI/control bytes in `name`/`desc` are NOT
stripped, because real catalog rows carry legitimate scene-release ANSI art.
Known gap: multi-token extractors like `7z x` are unsupported by the allowlist
(no `LhaArgs` key was added).

Valuable negatives, so nobody re-investigates: only the catalog digest is ever
trusted (`X-Archive-MD5` is captured but never read, so plain HTTP cannot
forge a "verified OK"); the cache cannot reparse differently because both
paths share one parser; logging uses `fputs` on a prebuilt buffer, so there is
no format-string vector.

## 3. Emulator fix — real Amiga network doors now work

Running the real door in our emulator found a defect in **our** code:
`BsdSocketLibrary` allocated socket descriptors starting at 100, but classic
AmiTCP's `fd_set` for `WaitSelect` is a 32-bit mask that doors build with the
universal `1L << s` idiom — `1L << 100` is undefined on 68K, so every such
door hung forever in `WaitSelect`. Fixed in `ff1a8e5f2`: descriptors now
allocate from 0, stay below 32, are reused after `CloseSocket`, and `socket()`
returns -1/`EMFILE` on exhaustion. `parseFdSet`/`setFdBit` were already
multi-word-correct; the defect was purely allocation.

This affected **every** network door using the standard idiom, not just ours.

## What is worth doing next

- **One-line follow-up:** `getdtablesize()`
  (`web/backend/src/amiga-emulation/api/library-vectors/bsdsocket-vectors.ts:213-222`)
  still returns 256 while the real cap is now 32 — a door asking how many
  sockets it may open is told 8x too many and hits `EMFILE` at the 33rd.
  `return BSD_FD_SETSIZE`. Not done here only because a door was running in
  the emulator at the time.
- **Separate ticket:** `ECONNREFUSED = 111` / `ETIMEDOUT = 110`
  (`BsdSocketLibrary.ts:30-31`) are Linux errno numbers, not classic
  BSD/AmiTCP (61/60), so a door branching on the numeric errno is unreliable.
  Pre-existing; the fix did not worsen it.
- **Send the door to the AmiExpress author.** `examples/doorrepo-c/README.md`
  is written for him; `docs/DOOR-REPO-API.md` is the contract.
- **CI:** `.github/workflows/door-ci.yml.disabled` — nothing runs jest. The
  type-drift guard, path-traversal test and fd-lifecycle tests are all
  manual-only today. Your call whether to re-enable; the `.disabled` suffix
  looked deliberate so I left it.
- From earlier waves, still unverified by you: DD door type-ahead, and the
  sysop page-accept chat flow (needs two sessions).
- Live `DEBUG_68K=1` is still ON in `/app/amiexpress/docker-compose.yml`.
- 19 exploratory DayDream doors are live at **ACCESS=0** (your explicit call,
  overriding a sysop-only recommendation) and are unverified.

## Environment quickref (all session-tested)

- C door: `make -C examples/doorrepo-c test|native|amiga|amiga-stub|live`.
  vbcc is `/opt/homebrew/Cellar/vbcc/0.9hp3` with `VBCC` exported; NDK headers
  at `/opt/homebrew/Cellar/m68k-amiga-elf-gcc/13.1.0/m68k-amiga-elf/sys-include`.
  `m68k-amiga-elf-gcc` itself is unusable (no hosted libc).
- Backend: `SKIP_DB_INIT=1 npx jest --config dev-scripts/jest.config.ts
  --rootDir . <path>` from `web/backend`; never the full suite (OOMs).
  `npx tsc --noEmit` must be clean.
- Live host `root@89.167.21.154`, container `amiexpress-bbs`. Deploys never
  refresh the live `Doors/` volume — force-sync after any door change and
  verify a marker string in the dist.
- **Do not run two tasks touching the same `Doors/<door>/` concurrently**: the
  pre-commit hook rebuilds that door's whole `dist/` from disk and will sweep
  in another agent's uncommitted work.
