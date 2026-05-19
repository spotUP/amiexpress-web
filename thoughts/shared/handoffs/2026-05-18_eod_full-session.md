---
date: 2026-05-18
topic: zmodem-web-unification, doors, corpus, live-bugs, sqlite-disk-parity
tags: [zmodem, doors, joincnf, aquascan, overclock, corpus, hetzner, user-data]
status: final
---

# End-of-day handoff — 2026-05-18

Marathon session — 22+ commits shipped, all deployed. Started on ZMODEM
web upload unification, ended diagnosing a SQLite-vs-binary-user.data
mismatch that breaks every XIM 68K door for web-registered users.

## Commits shipped (chronological)

| Hash | Summary |
|---|---|
| `c67e50385` | feat(zmodem): unify web upload through lrzsz |
| `a80b6fbbe` | feat(doors): 25000x default overclock, multi-file ZMODEM, batch overrides |
| `bd301e494` | test(zmodem): 27 regression tests across 4 files |
| `5400db306` | docs(corpus): broken-doors categorization |
| `1a5c51076` | refactor(upload): Phase 4 — delete dead HTTP-upload paths |
| `4d812b722` | chore(zmodem): gate per-byte diag logs behind LRZSZ_DEBUG / window.__ZMODEM_DEBUG__ |
| `9bb0b8b3d` | fix(zmodem): suppress ZRINIT only on web — fixed telnet upload regression |
| `afbd8ad64` | fix(listing): Q quits at flagPause / checkForPause prompts |
| `9163fc483` | fix(zmodem): JPEG download corruption — require XON tail before patching trailer |
| `d34222b07` | fix(zmodem): full 21-byte hex-header validation before patching |
| `038ae60f2` | ops: fetch-live-logs workflow (manual SSH log fetcher) |
| `a32a0c2cf` | ops: probe both /app/logs and /app/web/backend/logs |
| `7e4102f23` | ops: fall back to docker logs when file empty |
| `5af000d07` | ops: 'doors' probe target |
| `c5f3452c7` | ops: 'confs' probe target |
| `839988ed8` | ops: 'userdata' probe target |
| `889312df6` | revert(doors): roll back overclock 25000x → 100x — broke many 68K doors |
| `b923ac94f` | fix(commands): enable JoinCnf door for J — uncomment !LOCATION |
| `95bb91568` | fix(emu): always return 9999 for JH_REGISTER lineLen — JoinCnf splash |
| `ebc6c2e88` | fix(xim): lowercase user.data so JoinCnf reads what BBS writes |
| `8687d17cc` | fix(xim): user.data path falls back to case-insensitive resolve |
| `b06f156eb` | fix(xim): lowercase + fallback for user.keys/misc too |
| `f1247c610` | ops: deeper userdata probe — db + binary + confaccess dump |
| `7b78649d7` | ops: probe joincnf.cfg on live |
| `3b120c847` | ops: 'userdump' probe |
| `f7dd86641` | ops: simplify userdump probe to shell-only |
| `67eb43f3d` | ops: 'regenerate-users' target — sync SQLite users into binary user.data |

## ZMODEM web unification — DONE

Web RZ/Z/D commands now route through the same lrzsz pipeline
telnet/SSH use. Full pipeline (DIZ extraction → description prompt →
DIR placement → FR visibility) verified end-to-end via the user's
real upload.

Notable bugs crushed along the way:
- chunk-split at `**\x18B` boundaries (zsentry.js detection prereq)
- patchZrinitFlags loop (was single-shot)
- ZRINIT-suppression web-only (telnet regression fix)
- normalizeHexHeaderTrailers full-21-byte-shape match (JPEG corruption)
- MuffinTerm rewrite skipped for web
- deferred file-pick on the client (no rz timeout race)
- Phase 4 deletion of `/api/upload` BBS user path (~141 lines net)

32 regression tests pin every change.

## Door overclock — bumped then reverted

`a80b6fbbe` raised the DoorLifecycleManager default 100x → 25000x.
Bench data justified it for the corpus (294/324 safe at 100000x), but
**doors that ship in the live image but aren't in the corpus**
(AquaScan/AquaScan.000 vs corpus's DC_X107I_AquaScan/AquaScan)
misbehaved at the new default. User reported many 68K doors broken on
live; `889312df6` reverted.

Speedups available per-door via `OVERCLOCK=N` in .info. mtop / multitop
/ ByteKillHandler / QuickNew keep their explicit 5000x floor in
`HEAVY_BATCH_OVERRIDES`.

Plumbing verified: `DOOR_OVERCLOCK=5000` propagates env → DoorLifecycleManager
→ MoiraEmulator.setOverclocking(5000). `[runner:mtop]` log lines confirm.

## J / JoinCnf cluster — multiple bugs, mostly fixed

1. **J door wasn't registered** because `J.info` shipped from sanctuary
   with `!LOCATION=Doors:emp_tools/joincnf`. Patched the binary .info
   (byte 1179: `!` → ` ` so InfoFileParser sees it as enabled). Also
   case-corrected `joincnf` → `Joincnf` defensively. `b923ac94f`.

2. **Splash regression** (press-RETURN with empty banner) — historical
   fix mapped linesPerScreen=0 → 9999 (commit 975d8adb7), but the
   regression came back for users with linesPerScreen=23/24 where
   JoinCnf's equality-cmp paginator triggers when counter equals
   userLineLen. `95bb91568` always returns 9999 for any logged-on user.

3. **Only 4 conferences after splash fix** — XIM doors read binary
   `user.data` not the SQLite DB. Web-registered users like `spot`
   had no record in either lowercase `user.data` (just 5 KB / ~21
   slots, none named spot) or capital `User.data` (301 KB / 1259
   slots, no record matching spot). Door read empty slot → default
   limited confaccess → 4 visible confs.

   `ebc6c2e88` + `8687d17cc` aligned the path to lowercase (where
   UserFileManager writes) with case-insensitive fallback.
   `67eb43f3d` shipped a one-shot `regenerate-users` workflow target
   that runs `regenerate-user-files.ts` inside the live container:
   reads every SQLite user, writes their binary record at a sequential
   slot, updates `slotNumber` in the DB to match.

   After the regen ran:
   - spot → slot 22 (from DB slot 2)
   - sysop → slot 24 (from DB slot 1)
   - All other web users get binary records too
   - Capital `User.data` untouched (kept as orphan/backup)

   **Confaccess truncates from 25 chars (DB) to 10 chars (binary
   format limit per record).** So users will see up to 10 confs in
   JoinCnf — that's the AmiExpress 3.x format ceiling, not an
   immediate-fix bug.

## DEEP AUDIT owed (task #19, CRITICAL for next session)

**Original AmiExpress is disk-only.** Every state class a 68K door
might read must exist on disk in canonical Amiga binary/text format.
Today's JoinCnf hit was the visible tip. Likely other class members:

| State | DB? | Disk? | XIM doors read disk? |
|---|---|---|---|
| Users (name, secLevel, confaccess) | ✓ | user.data/keys/misc | ✓ (fixed tonight) |
| Conferences | (file-based already) | ConfConfig.info | ✓ |
| Messages | ✓ (likely) | per-conf Msgs/ | ❓ |
| Files (uploads) | ✓ | DIRn + FILES.BBS | ❓ |
| Caller log | ✓ | CallersLog | ❓ |
| File flags | ✓ | Flag.x.N | ❓ |
| Message pointers | ✓ | user-N.last | ❓ |
| Daily bytes / ratios | ✓ | user.misc binary | ✓ in struct |
| Bulletins | (file) | Bulletins/*.txt | ✓ |
| ACS / access flags | (file) | Access/ACS.*.info | ✓ |
| OLM | ✓ (likely) | OLMs disk | ❓ |

For each ❓: grep for `db.something*(` writes without a paired
`*FileManager.update*()` or disk write. If a door fails with "no data"
or "denied" on live but works locally on a fresh-imported BBS, it's
hitting this class.

Mid-term shape: hook every `db.update*()` with a paired disk sync
helper, OR a daemon that mirrors DB → disk on every change.

## Live state at session end

- `https://bbs.uprough.net/health` → 200
- All commits deployed
- live `user.data` (lowercase, ~6 KB) regenerated from SQLite —
  spot at slot 22, all other web users present
- Backups at `*.before-regen-20260519T001829.bak`

## Open items remaining

| # | Task | Status |
|---|---|---|
| 15 | DREWALL leaks main menu prompt AFTER door exit | Needs tighter repro with DREWALL_TRACE=1 locally |
| 19 | DEEP AUDIT: SQLite-only state that 68K doors need on disk | Substantial; tackle first thing tomorrow |

## Other observations

- `wall.info` LOCATION starts with `%LOCATION=` — that's a NewIcons
  length-prefix byte, our `amiga-command-parser.util.ts:157` strips
  it correctly. NOT a bug — just looks weird in `strings` output.
- bbslink-based commands (arcl, lord, lord2, mega, netr, etc. —
  ~30 commands) all point to `Doors/bbslink/bbslink` which is not
  installed locally. If you want them, the bbslink binary needs to
  be added to the image.
- `Commands/BBSCmd/GWALL.info` LOCATION → `Doors/GWall/GWall` —
  directory exists as `Doors/Gwall/` (case mismatch handled by
  amigafs.resolvePath) but the binary inside isn't there, only
  `gwall.cfg`. Door needs installing or `.info` disabling.

## Tooling shipped

`.github/workflows/fetch-live-logs.yml` — manual-dispatch workflow with
multiple targets:
- `backend` — backend.log tail with optional grep
- `preview` — preview.log
- `xim` — xim-debug.log
- `all-recent` — list logs dir + tail backend
- `doors` — locate AquaScan binary + Doors top-level
- `confs` — dump all ConfConfig.info on volume + default-data
- `userdata` — DB + user.data file sizes + md5 + hex of confaccess
- `userdump` — name + confaccess for first 21 slots of lowercase, name search for "spot" in capital
- `joincfg` — dump joincnf.cfg
- `regenerate-users` — one-shot run of `regenerate-user-files.ts` with backup

Usage:
```
gh workflow run fetch-live-logs.yml -f log=<target> [-f tail=N] [-f grep='regex']
gh run view <id> --log | grep 'out:'
```

## Quick-resume pointers for tomorrow

```
# Continue task #19 audit
grep -rn 'db\.\(update\|insert\)' web/backend/src --include='*.ts' | grep -v test | grep -v node_modules
# Each hit: confirm a matching disk-sync exists nearby

# Continue task #15 DREWALL repro
cd /Users/spot/Code/amiexpress-web
DREWALL_TRACE=1 ./dev/scripts/start-servers.sh --bbs-only
# Then run `wall` in browser; capture XIM message flow

# Multi-file ZMODEM batch test (task #6 wiring is in place; needs e2e)
# In browser, type RZ, pick 2-3 small files, watch description prompts cycle
```
