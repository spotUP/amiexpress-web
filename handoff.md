# Handoff

## 2026-05-20 — multi-file upload fix cluster + parity diff closeout

**Full archive**: `thoughts/shared/handoffs/2026-05-20_session-handoff.md` (write at end of next session)

### Live state at session end
- `https://bbs.uprough.net/health` → 200, container fresh after deploys of
  `99d83e1db` (slotnumber on createUser) and `18ee0f1eb` (conferences sync).
- Live SQLite `conferences` table now mirrors disk `ConfConfig.info` —
  all 14 conferences populated (was 3 seeded). Verified via the new
  `conferences` case in `fetch-live-logs.yml`.
- New web registrations now get `confAccess` from
  `system_config.new_user_conf_access` (was hardcoded `XXX`).
- Multi-file ZMODEM upload works end-to-end on web (was hung after
  file 1 due to dead HTTP picker path).
- DREWALL "no" in LOGON chain no longer flashes the BBS menu prompt
  between chained doors (#15 closed).

### Shipped this session (21 commits — `d9494d5f4..HEAD`)

**Parity / data integrity:**
- `e6fad0b4a` ConfDB message-pointer writer (74-byte confBase
  read-modify-write at `<conf>/Conf.DB[(slot-1)*74]`). 8 unit tests.
- `8194a2346` ConfDB pointer-sync wiring integration tests (4).
- `99d83e1db` `userRepository.createUser` assigns `slotnumber = MAX+1`
  on insert — fixed friend `notorious` lockout ("That account has
  been deleted." on second login). 2 regression tests.
- `18ee0f1eb` `db.syncConferencesFromDisk` mirrors `ConfConfig.info`
  into SQLite `conferences` table at startup — root cause of the
  "still only 4 confs" cascade. 4 regression tests.
- `03d355935` callers-log dual-write SQL + disk for 3 SQL-only sites
  (Joined conference, Deleted file, Moved file). 5 tests.

**Transfer pipeline:**
- `cf2121c86` U command routes through ZMODEM (was emitting
  `show-file-upload` → dead HTTP picker after Phase 4 cleanup). 4
  regression tests.
- `a0196a5e2` U/RZ upload + Z download pipeline cluster:
    - `startZmodemUpload` + `startZmodemDownload` install real
      socket-emit sender for web (was no-op placeholder from
      `getTransferTransport`).
    - U-command `onComplete` mirrors RZ pipeline (DIZ + description
      + DIRn + FILES.BBS + log).
    - `rz` flags transport-aware: `-y` overwrite for web (zmodem.js
      can't ZRPOS), `-r` resume for telnet/SSH.
    - `received[]` derived from rz stderr `Receiving:` lines (was
      readdir-diff that failed under `-y` overwrites).
    - Web registration `confAccess` from `system_config.new_user_conf_access`.
- `9690e42ca` U13 — 2 MB playpen free-space floor; refuses upload
  with express.e parity text "Not enough free space for uploading!".
- `f28420aa8` D5 — `flaggedFilesManager.clearFiles(userId)` on
  successful ZMODEM download (telnet/SSH path was leaking the queue).
- `63b071975` D16 — Restricted-comment gate in batch download
  (security-adjacent; user could flag then F+D-batch-download a
  sysop-restricted file).
- `faa53df80` D7 — extracted `displayULStats` to shared util so
  pre- and post-transfer banners are identical.

**Cleanup + ops:**
- `44dfb635e` #15 chained-door menu-prompt leak in `launchAmigaDoor`
  (RETURNCOMMAND chain → next door, but `subState=DISPLAY_MENU`
  flashed first). 4 regression tests.
- `3b5cbdedc` removed dead `startFileUpload` + 4 imports (72 lines).
- `f9881547c` `conferences` case in `fetch-live-logs.yml` for
  diagnosing conf-sync state on live.
- `bb0aafe42` `__lastDoorT0` flag so first-JH_SM timing log fires
  once per door entry instead of once per session.
- `dd8162551` parity-diff doc updates: U8 / U9 / U11 audit
  conclusions (design divergences documented, no code change needed).

**Disk: 18 GB freed** — git gc (10 packs → 1), npm cache clean, brew
cleanup, root-level orphans (`68klog.txt` 40 MB, stale tsx cache,
`/tmp` debris). Repo down to 6.1 GB.

### Open items

- **U7 telnet/SSH U command** — code path exists, blocked by site
  `BBSCmd/U.info` pointing U to a different door (UL-Logoff). Site
  config decision, not a code gap.
- **U10 multi-node upload coordination** — `sendMasterUpload` cross-
  node lock. Deferred — needs shared registry, rare scenario.
- **D19/D20 ratio-check / per-conf accumulator audit** — UNVERIFIED;
  lower-priority deep audit.
- **OLM disk parity / Votes disk parity** — gaps, low priority, no
  known door consumer.
- **CREDITBYKB on sites with 68K-door co-writers** — TS port stores
  bytes uniformly; would diverge from doors that write user.data with
  the toggle on. Live (bbs.uprough.net) has it off, so non-issue.
  Documented in parity diff.

### Important gotchas (memo to future-me)
- AmiExpress binary `conferenceAccess` is **10 CHAR hard ceiling** —
  SQLite holds 25, binary truncates on regen. >10 confs visible
  requires format extension. 68K doors that read user.data see only
  confs 1-10. Web BBS handlers use SQLite confAccess (full length).
- macOS APFS case-insensitive vs Linux container case-sensitive bit
  user.data lookups; lowercase canonical + amigafs.resolvePath
  fallback in place.
- `J.info` shipped from sanctuary with `!LOCATION` (disabled). Patched
  in place — re-restoring BBSCmd from sanctuary will undo.
- Default door overclock is **100x**. Per-door speedup via
  `OVERCLOCK=N` in `.info`.
- tsx esbuild cache at `/var/folders/.../T/tsx-501/` can serve stale
  transpiled code across restarts. If a source change "doesn't
  apply", clear that dir before restarting.

### Quick resume entry points

```bash
# Live conferences table snapshot
gh workflow run fetch-live-logs.yml -f log=conferences

# Live backend log grep
gh workflow run fetch-live-logs.yml -f log=backend -f tail=2000 -f grep='ERROR|spawn'
gh run view <id> --log | grep 'out:'

# DREWALL trace (if #15 ever returns)
DREWALL_TRACE=1 ./dev/scripts/start-servers.sh --bbs-only

# Corpus assertions
cd web/backend && npx tsx src/scripts/corpus-integration-runner.ts --concurrency 1

# Force-restart local backend (clears tsx cache)
ps aux | grep -E "tsx.*backend|start-servers" | grep -v grep | awk '{print $2}' | xargs -I{} kill {} 2>/dev/null
rm -rf /var/folders/w6/hc_wf7v94_dcn98mmjb_k9fh0000gn/T/tsx-501/
nohup env LRZSZ_DEBUG=1 ./dev/scripts/start-servers.sh --bbs-only > /tmp/start-servers.log 2>&1 < /dev/null &
disown
```

---

## 2026-05-19 — ZMODEM web unify shipped; doors cluster fixed; SQLite/disk audit started

**Full archive**: `thoughts/shared/handoffs/2026-05-19_session-handoff.md`

Earlier work: ZMODEM web unification + Phase 4 dead-code deletion
(~141 lines net), 32 regression tests, doors-overclock revert,
JoinCnf cluster fix, corpus capture (324 + 320 assertions),
`fetch-live-logs.yml` manual-dispatch ops workflow, live regen of
user.data/keys/misc from SQLite. See archived handoff for detail.

The SQLite ↔ disk parity audit started 2026-05-19 was closed across
2026-05-19 and 2026-05-20 — see
`thoughts/shared/research/2026-05-18_sqlite-disk-parity-audit.md`.

---

## 2026-05-18 — Overclock bench + in-process corpus tester + WSS endpoint

**Full archive**: `thoughts/shared/handoffs/2026-05-18_overclock_corpus_wss_zmodem.md`

Earlier work: door overclock bench (`dev/scripts/bench-overclock.ts`),
in-process integration corpus runner v0.1, WSS terminal endpoint at
`/ws/terminal`, BBSCmd restored from sanctuary, LOGOFF
syscommand.util crash fix.
