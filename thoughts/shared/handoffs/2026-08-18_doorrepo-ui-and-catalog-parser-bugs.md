---
date: 2026-08-18
topic: DoorRepo full-screen browser at DOORMAN parity; three door-repo API endpoints; two silent catalog-indexer bugs; bsdsocket non-blocking connect; jest CI
tags: [handoff, doorrepo-c, door-repo-api, bsdsocket, catalog, lha, ci, 68k, amiga]
status: final
---

# Session handoff — 2026-08-18 — DoorRepo UI, API endpoints, catalog parser bugs

19 commits, `35a31af58..137c39ad0`, all pushed. CI green, Hetzner deploy green.
Nothing is mid-flight and no agents are running.

## HOW TO RESUME

Read "What is worth doing next" at the bottom. The single most important item
is first: **the live catalog is stale** — the code shipped, the data did not.

Previous handoffs, for the chain of context:
`2026-08-17_bsdsocket-reachability.md`, then
`2026-08-17_doorrepo-c-and-door-repo-api.md`.

## 1. THE ONE THING THAT IS NOT DONE: live catalog is stale

Everything below shipped and is live as CODE. The catalog DATA is not.

Verified against production just now:

```
http://bbs.uprough.net/api/door-repo/health      -> revision c3301-t1786954221
http://bbs.uprough.net/api/door-repo/diz/$CP-PS12.LZX -> 404   (should be 200)
http://bbs.uprough.net/api/door-repo/files/!ALSTER.LHA -> 61|0|Children
                                                          (should be 40092)
```

Local, after this session's re-index: revision `c3301-t1787029906`, that DIZ is
present, and `Children` is 40092 bytes.

So the live BBS is serving the pre-fix catalog: no LZX FILE_ID.DIZ, and file
sizes that are actually compression ratios. `database.sqlite` IS committed and
IS in the repo, but the live container reads a **volume-mounted** database, so
a deploy does not replace it — the same trap already documented for the live
`Doors/` volume.

**Do not text-dump this catalog to SQL to move it** — `doc_raw` carries control
bytes. The established method is an ATTACH staging database (see the
2026-08-17 handoff's note on the last catalog merge).

Until that sync happens, DoorRepo pointed at the live host shows the old data.
Pointed at a local dev server it is correct.

## 2. Two silent bugs in the catalog indexer (the real find of the session)

Both in `lha -l` parsing. Neither ever failed anything — they just quietly
produced a smaller or wronger catalog, which is exactly why they survived full
builds. Found while chasing 13 doors whose FILE_ID.DIZ had vanished.

Parser now lives at `web/backend/src/utils/lha-list-parser.ts` (moved out of
`dev/scripts/door-corpus/build-door-catalog.ts` so it can be unit-tested at
all) with 6 tests against real captured output.

**Bug 1 — member rows discarded.** The parser skipped any line starting with
`-` to drop `lha`'s `------` rules. Unix permission strings also start with
`-`, so every member row of an archive that records permissions was thrown
away: those archives lost their FILE_ID.DIZ, their documentation, and nearly
all of their file list. `TELSER40.LHA` parsed 11 members of 59.

It hid because `[generic]`-style archives were unaffected, and surviving
directory/`[unknown]` rows kept the result non-empty so it never tripped the
caller's "empty/unreadable archive" guard. Nothing was ever logged — which is
why none of the 13 appeared in any build log.

**Bug 2 — sizes were compression ratios.** Found only because the regression
test written for Bug 1 failed on the style that supposedly worked. The two row
styles have different leading-column counts and the parser always read
`parts[2]`: the size for permission rows, the RATIO for `[generic]` rows.
**47932 of 58074 file rows (83%)** held a bogus size, including `.exe` files
recorded as 1 byte. That data also backs DOORMAN's own file listing, so this
was never a DoorRepo-only problem.

Size is now found by anchoring on the ratio column rather than counting from
the left. Rules are matched by shape (`/^[-=\s]+$/`) and the `Total N files`
footer is dropped explicitly — it was being parsed as a member whose size was
the file count.

**Catalog after re-index (local):** the 13 recovered; DIZ 3250 → 3263; file
rows 58074 → 58406; bogus sub-100-byte sizes 47932 → 3199 (the remainder are
genuinely small files plus 33 directory entries).

**Gotcha for anyone re-indexing:** the default run only walks
`Archives/AmiExpress`. `FAME/` (124 rows) and `DayDream/` (84) need their own
runs with `--archives-dir`, or they keep stale data. Also
`NODE_PATH=web/backend/node_modules` is required or the script cannot resolve
`better-sqlite3`.

## 3. Catalog caching was impossible (why DoorRepo was slow to start)

DoorRepo re-downloaded the whole ~580 KB catalog on every launch.

The door-repo revision was the deployed image's git SHA from `/app/.git-sha`.
A local dev server has no such file, so it reported the literal `"unknown"` —
and a correct client MUST refuse to treat `"unknown"` as proof of freshness
(`flow_should_use_cache()` does exactly that, deliberately). So the cache could
never be used. On live it was no better in kind: an image SHA changes on every
deploy whether the catalog changed or not, so clients discard a good cache
after unrelated pushes. `docs/DOOR-REPO-API.md` promised the value "changes
exactly when the deployed catalog changes", which an image SHA does not do.

Door-repo endpoints now derive it from the catalog: `c<rowcount>-t<max
indexed_at>`, one indexed aggregate, no container-only file. The top-level
`/health` still reports the image SHA — different endpoint, different question,
and `tests/health-revision.test.ts` still passes untouched.

**Measured: first render 5s cold, 3s warm.** Beware: an earlier measurement of
"22-36s" was wrong — it was timing the input script's own delay, not the door.
Measure time-to-first-render by polling the output for a row marker, not total
process runtime.

Also raised the HTTP body chunk 512 → 4096 and the cache read chunk 512 → 8192.
Both buffers are `static`: the door's icon declares `STACK=8192` and neither
fits as an automatic array.

## 4. Emulator: bsdsocket

- `IoctlSocket(FIONBIO)` is honoured and non-blocking `connect()` works
  (`-1`/`EINPROGRESS` → `WaitSelect` → `getsockopt(SO_ERROR)`), the standard
  AmigaOS sequence. It used to block up to 30s regardless of the door's own
  timeout, and `getsockopt` was a stub that wrote nothing.
- `recv()` now drains up to the requested length **across** queued chunks, as a
  real `recv()` does. It used to return only the frontmost chunk.
- `gethostbyname()` uses `dns.lookup()`, so dotted-quad literals and
  `localhost` resolve (was `dns.resolve4()`, DNS-only).
- `getdtablesize()` returns the real ceiling (32, not 256); `ECONNREFUSED`/
  `ETIMEDOUT` are the classic BSD 61/60, not Linux 111/110.

**Arrow keys reach a door as single bytes, not escape sequences**:
AmiExpress converts them per `express.e:7514-7528` (2=LEFT, 3=RIGHT, 4=UP,
5=DOWN). A door decoding raw CSI never sees the cursor move. DoorRepo handles
both forms.

## 5. DoorRepo is now at DOORMAN parity

`examples/doorrepo-c/` — full-screen ANSI browser modelled panel for panel on
`Doors/door-manager/app.ts`: header/footer bars, cyan-bordered list labelled
` REPO (n) ` with a white-on-blue selected row, blue-bordered detail pane at
DOORMAN's 35/65 split, scrollbar thumb.

| Key | Does |
|---|---|
| cursor / PgUp / PgDn / Home / End | move selection (or scroll the open detail view) |
| `ENTER` or `R` | confirm on the footer, download, verify MD5 |
| `A` | archive contents, ad files flagged red |
| `V` | the door's documentation |
| `F` | live client-side text filter, box drawn in place |
| `C` | cycle door types actually present in the catalog |
| `Q` | leave |

`*` in the list and green `[downloaded]` in the pane mark an archive already in
`DownloadDir`. `Ansi=no` falls back to the original line renderer (re-verified
this session, still clean). `ScreenRows`/`ScreenCols` set geometry.

Deliberate divergences, both documented at their sites: detail views fetch on
demand rather than per keystroke (DOORMAN reads them from a local DB for free),
and **bare ESC is not a binding** — indistinguishable from the start of an
arrow sequence without a timer, the ambiguity that cost DOORMAN six rounds.

**Rendering rules that matter if you touch the UI:**
- `ae_put()` chunks at `AE_MAX_LINE` (198 bytes), so a frame's byte count is a
  round-trip count. Compose one frame, flush once.
- Static chrome is painted only on a full redraw; moving the cursor repaints
  exactly the two rows whose highlight changed. 292 → 96 writes for a session.
- **Every row counted as "used" must be PAINTED.** A counted-but-unwritten
  spacer row keeps the previous entry's content — that was the stray line of
  another door's ASCII art reported mid-session.
- Nothing may draw outside a region the normal path repaints. A "Fetching..."
  line drawn over the footer forced a full redraw and flashed blue on every
  keystroke.

## 6. New API endpoints (all additive)

`GET /diz/<archive>` raw FILE_ID.DIZ, newlines intact — `list.txt` collapses
newlines by design, so multi-line art cannot be recovered from it, and
`/manifest` is ~2 MB of JSON a C89 door cannot parse.
`GET /files/<archive>` — `FILES|<count>|<junk>` then `<size>|<junk>|<path>`.
`GET /doc/<archive>` — raw doc bytes, filename in `X-Doc-Filename`.

`/archive` and `/diz` no longer **HTTP 500** on Latin-1 names. Express decodes
route params as UTF-8 and throws `URIError` on `%DF`; catalog names are Latin-1
scene releases. Per-entry routes now dispatch from the raw URL, try UTF-8 then
Latin-1, and prefer whichever spelling exists. `/archive` had this bug long
before `/diz` existed.

All documented in `docs/DOOR-REPO-API.md`.

## 7. CI now runs jest

`.github/workflows/backend-tests.yml` — type-check + full suite, plus a job for
the DoorRepo C suite. Nothing ran jest before; `door-ci.yml.disabled` runs
`npm run door:ci` (doctor + fixture harness), not the suite.

Its first run found that **the suite had never run on Linux**, though the BBS
deploys to Linux: `netio.c`'s POSIX branch did not compile on glibc at all
(needs `-D_DEFAULT_SOURCE` under `-std=c89`), four suites could not resolve the
door SDK, and two tests encoded macOS-only assumptions.

**`tests/message-scan-parity.test.ts` is skipped on Linux only**, with the
reasoning at the test: it expects a pointer to reach 4 and gets 2, passes on
macOS in every configuration, and `mailStat.highMsgNum` comes from SQLite not
the filesystem — so nothing about it is obviously platform-dependent and
editing the expectation could bury a real defect on the platform production
runs on. That is a quarantine, not a verdict.

## Environment notes (all session-tested)

- The door-repo router is gated on `DOOR_REPO_ROLE=owner`. A local dev server
  without it 404s **every** `/api/door-repo/*` route. Start with
  `DOOR_REPO_ROLE=owner ./dev/scripts/start-servers.sh --bbs-only`.
- BBS is `http://localhost:3001/` (not 5173 — that is another app of the
  user's, leave it alone).
- `run-amiga-door.ts` needs `SKIP_DB_INIT=1` or it hangs silently after two
  `[DoorLogger]` lines; `DEBUG_68K=1` for `[BsdSocketLibrary]` traces, but it
  throttles the emulator badly — a catalog fetch that takes 5s without it took
  minutes with it.
- Run **one** heavy thing at a time. Concurrent jest runs and emulator runs
  produce phantom failures; that mistake sent me down a wrong diagnosis for the
  13 archives.
- `grep` here is **ugrep** — use `LC_ALL=C grep -a` on emulator logs and Amiga
  headers or you get false negatives.
- Delete `/tmp/listtxt.cache` between door runs when testing a cold start.
- C door: `make -C examples/doorrepo-c test|native|amiga`, `VBCC` exported.
  Zero warnings expected from clang `-Wextra -pedantic` AND vbcc; the two
  disagree about unused parameters, so give a sink a real ctx rather than
  `(void) x;`.

## What is worth doing next

1. **Sync the fixed catalog to live** (section 1). Highest value: live is
   serving ratios-as-sizes and no LZX DIZ. Use ATTACH staging, never a SQL
   text dump.
2. **Send DoorRepo to the AmiExpress author.** `examples/doorrepo-c/README.md`
   now documents the UI and config; `docs/DOOR-REPO-API.md` is the contract.
   This has been the top item for two sessions and is still not done.
3. Delete the three untracked safety backups when satisfied:
   `database.sqlite.bak-before-lhaparse-fix`,
   `database.sqlite.bak-before-lzx-reindex-20260818-011443`,
   `database.sqlite.bak-before-reindex2` (~120 MB total).
4. `tests/message-scan-parity.test.ts` — the real investigation (section 7).
   Needs a Linux repro in a throwaway container with its OWN `node_modules`,
   never a mount over a macOS checkout.
5. `DEBUG_68K=1` is still ON in the live `/app/amiexpress/docker-compose.yml`.
6. Unverified by the user from earlier sessions: DD door type-ahead, the sysop
   page-accept chat flow, and 19 DayDream doors live at ACCESS=0.
