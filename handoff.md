# Handoff

## 2026-05-19 — ZMODEM web unify shipped; doors cluster fixed; SQLite/disk audit started

**Full archive**: `thoughts/shared/handoffs/2026-05-19_session-handoff.md`

### Live state at session end
- `https://bbs.uprough.net/health` → 200, container fresh as of `bf6b4b5f9`
- Web RZ upload working end-to-end (DIZ → description → DIR → FR)
- Telnet ZMODEM upload + download working (after a regression I introduced + fixed)
- JPEG/binary download corruption FIXED (`9163fc483` + `d34222b07` — full 21-byte hex-header validation)
- 68K doors back to working after overclock revert (`889312df6`)
- J runs JoinCnf (was disabled via `!LOCATION`); splash suppressed; user records regenerated to binary user.data

### Shipped (30 commits this session — `56389a447..HEAD`)
- **ZMODEM web unification** + Phase 4 dead-code deletion (~141 lines net)
- **32 regression tests** across 4 files
- **Doors**: overclock revert + JoinCnf cluster (LOCATION enable, splash 9999, lowercase user.data with case-insensitive fallback)
- **Corpus**: 324 captured + 320 assertions populated
- **Ops**: `.github/workflows/fetch-live-logs.yml` manual-dispatch for live log + admin (backend / preview / xim / doors / confs / userdata / userdump / joincfg / regenerate-users)
- **Live regen**: `regenerate-user-files.ts` ran inside container; spot now at slot 22 with backups at `*.before-regen-20260519T001829.bak`

### Open items
- **#15** DREWALL leaks menu prompt AFTER door exit — needs DREWALL_TRACE=1 repro locally
- **#19** DEEP AUDIT: SQLite-only state 68K doors need on disk — audit doc `thoughts/shared/research/2026-05-18_sqlite-disk-parity-audit.md` updated 2026-05-19.
  - **Users table: SOLVED** — repo-level sync at `user-repository.ts:260-278` (since ad3f77d5d, 2026-01-04) covers all 36 `db.updateUser` sites. Original 8-unpaired finding was a false positive from grep-scope.
  - **Messages: SOLVED** — `message-repository.ts` create/update/delete/move all paired with .msg + HeaderFile + A&lt;N&gt; writes.
  - **Message pointers: RESOLVED 2026-05-19** — new `MessagePointerFileManager` (`web/backend/src/services/MessagePointerFileManager.ts`) writes 74-byte confBase records to `<bbsRoot>/Conf{N}/Conf.DB` at offset `(slot-1)*74`. Read-modify-write preserves all unrelated fields (handle, bytes, ratio, etc). Hooked into both `message-pointers.util.ts:updateReadPointer/updateScanPointer` and `message-repository.ts:updateReadPointer`. Best-effort sync (SQL authoritative). 8 regression tests pass, type-check clean, existing message-repository suite still green.
  - Real raw-SQL gap: `initialization.ts:671` confaccess startup migration — one-shot, low impact (resyncs on next user write).
  - Remaining state classes audited 2026-05-19:
    - **Conferences: SOLVED** — `conference-repository.ts:153-193` pairs `conferenceFileManager.updateConferenceFile()`.
    - **File flags: SOLVED** — `file-flag.util.ts` is disk-first (no SQLite).
    - **Callers log: BIFURCATED BY DESIGN** — `callersLog()` (SQL) and `callersLogManager.*` (disk) are independent; call sites have to invoke both. Some don't (`conference.handler:308`, `file.handler:229/360`) — minor inconsistency.
    - **OLMs: GAP, LOW PRIORITY** — SQLite-only; no known door consumer.
    - **Votes: GAP, LOW PRIORITY** — SQLite-only; no known door consumer (express.e BBS core only).
  - **Net priority work**: ConfDB message-pointer disk writer is the only high-impact gap.

### Important gotchas (memo to future-me)
- AmiExpress binary `conferenceAccess` is **10 CHAR hard ceiling** — SQLite holds 25, binary truncates on regen. > 10 confs visible requires format extension.
- macOS APFS case-insensitive vs Linux container case-sensitive bit a few times today (User.data vs user.data). Lowercase canonical + amigafs.resolvePath fallback now in place for `user.data`/`user.keys`/`user.misc`.
- `J.info` shipped from sanctuary with `!LOCATION` (disabled). Patched in place — re-restoring BBSCmd from sanctuary will undo.
- Default door overclock is back at **100x** (was 25000x but broke doors not in the bench corpus). Per-door speedup via `OVERCLOCK=N` in .info.

### Quick resume entry points
```
# #19 audit re-run
for f in $(grep -rln "db\\.updateUser\\b" web/backend/src --include="*.ts" | grep -v test); do
  while IFS=: read line _; do
    near=$(awk -v t="$line" 'NR>=t-3 && NR<=t+30' "$f" | grep -c userFileManager)
    [ "$near" = "0" ] && echo "UNPAIRED: $f:$line"
  done < <(grep -n "db\\.updateUser\\b" "$f")
done

# #15 DREWALL repro
DREWALL_TRACE=1 ./dev/scripts/start-servers.sh --bbs-only

# Validate corpus assertions
cd web/backend && npx tsx src/scripts/corpus-integration-runner.ts --concurrency 1

# Live log fetch (any time)
gh workflow run fetch-live-logs.yml -f log=backend -f tail=2000 -f grep='ERROR|spawn'
gh run view <id> --log | grep 'out:'
```

---

## 2026-05-18 — Overclock bench + in-process corpus tester + WSS endpoint

**Full archive**: `thoughts/shared/handoffs/2026-05-18_overclock_corpus_wss_zmodem.md`

### Shipped that day
- **Door overclock bench** (`dev/scripts/bench-overclock.ts`). Swept all 324 corpus doors — **294 safe at 100000x**, 4 cap at 25000x, 25 pre-existing failures. Results in `report-overclock.json`.
- **Batch-door overclock plumbing**: `runAmigaDoorViaRunner` reads `.info` `OVERCLOCK=` + applies 5000x floor for mtop/multitop; runner stderr now piped to parent log with `[runner:<name>]` prefix.
- **In-process integration corpus runner v0.1** (`web/backend/src/scripts/corpus-integration-runner.ts`). Drives doors through real `executeDoor()` + mock socket + minimal session.
- **WSS terminal endpoint** at `/ws/terminal`.
- **BBSCmd restored** from sanctuary reference BBS.
- **LOGOFF syscommand.util crash fix**.

---

## 2026-05-17 — Live/local divergence audit + structural fixes

**Full archive**: prior handoffs.

After months of live behaving differently from localhost in ways that
were always written off as one-offs, a deep audit found two genuine
root causes and a class of stale-volume issues. All three fixed,
verified live, regression-tested.

### Root causes fixed
1. ACS path mismatch on prod (`d1320d624`)
2. Case-sensitive screen variant ordering (`faa210e66`)
3. FRONTEND syscmd not invoked on telnet/SSH (`91272c522`)
4. Volume hot-fixes applied live + tiered sync policy (`629dc1cdf`)
5. LF→CRLF normalize on telnet/SSH emitter (`81c317766`)
6. Regression tests (`d91680017`)
