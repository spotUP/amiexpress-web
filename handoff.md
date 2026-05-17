# Handoff

## 2026-05-17 — Live/local divergence audit + structural fixes

After months of live behaving differently from localhost in ways that
were always written off as one-offs, a deep audit found two genuine
root causes and a class of stale-volume issues. All three fixed,
verified live, regression-tested.

### Root causes found + fixed

1. **ACS path mismatch on prod (`d1320d624`).** `initializeSecurity`
   computed `bbsRoot` as `path.resolve(cwd, '..', '..')` when `BBS_ROOT`
   was unset. On localhost cwd is `web/backend`, so `../..` lands at the
   project root with `Access/` present. In the container cwd is
   `/app/web/backend`, so `../..` lands at `/app` — which has no
   `Access/`; the BBS data is at `/app/data/bbs/Access/`.
   `loadAcsAccessFiles` logged "Access/ directory not found",
   `findAcsLevel` returned `-1` for every secLevel, `checkSecurity`
   rejected sysop (secLevel=255) for `j`/`who`/`b`/`r`/`u` — every
   command that goes through the ACS table. **Fix:** fall back to
   `BBS_DATA_DIR` before cwd-relative. Image-side ACS files were
   correct all along; the loader just pointed at the wrong directory.

2. **Case-sensitive screen variant ordering (`faa210e66`).** The
   loader scanned `BBSTITLE.TXT` (uppercase) before `BBSTITLE.txt`
   (lowercase). macOS' default APFS is case-insensitive (the two
   spellings resolve to one inode), so this was invisible in dev. On
   the prod Linux Alpine container both files coexisted: the volume
   had a stale May 4 `BBSTITLE.TXT` (no trailing `~SMC|`) shadowing
   the May 17 `BBSTITLE.txt` shipped by the image. The stale file
   left slowmo engaged through the BBSTITLE render, the wrap path
   emitted hide-cursor + cursor-home after the art, and the login
   prompt printed inside the ASCII banner instead of beneath it.
   **Fix:** reorder all variant lists (`BBSTITLE`, `AWAITSCREEN`,
   `addAnsiVariants`, PETSCII fallbacks, RIP fallbacks) to prefer
   lowercase. Image ships lowercase; uppercase is legacy fallback.

3. **FRONTEND syscmd not invoked on telnet/SSH (`91272c522`).** Web
   ran the FRONTEND syscmd at `index.ts:1545` before the ANSI prompt;
   telnet/SSH skipped it entirely so the Who's-Online door never
   showed on these transports. **Fix:** `setupTelnetSSHHandler`
   stashes the emitter on the connection, telnet-server.ts and
   ssh-server.ts both await `runSysCommand(emitter, session,
   'FRONTEND', '')` before the graphics prompt.

### Volume hot-fixes applied live

The divergence wasn't only structural — the live `bbs-data` named volume
had drifted from the image over months because the entrypoint's
"copy only if missing" sync block (`docker-entrypoint.sh:90-126`)
never propagated image updates to already-present files.

- `Access/ACS.255.info` — image had `ACS.JOIN_CONFERENCE` + 20 other
  permissions added after the volume was first initialized; volume
  was stale. Replaced from `/app/default-data/`.
- `Conf.DB` — 0 bytes on the volume since 2025-12-07 (writes to it
  have been silently failing for 5 months; BBS ran on SQLite alone).
  Replaced with image's 645KB version → 14 conferences load.
- `Screens/BBSTITLE.TXT` — renamed to `.bak.stale` so the lowercase
  variant the image ships wins.

### Tiered sync policy (`629dc1cdf`)

Updated `docker-entrypoint.sh` to split root config files into:
- **IMAGE-OWNED** (hash-compared on every restart; overwrite on
  drift): `Access/*.info`, `Conf.DB`, `Doors.info`, `ConfConfig.info`,
  `Commands.info`, `Access.info`, `Protocols.info`, `Languages.info`,
  `Areas.info`, `Languages.info`, `Utils.info`, …
- **VOLUME-OWNED** (init from image if missing; never overwrite):
  `Node*.info`, `Conf*.info`, `SysopStats.info`, root data files
  (batch scripts, .dat, `express` binary).

This permanently prevents the ACS.255.info / Conf.DB drift class
without nuking sysop edits made via the admin TUI. `FORCE_REINIT_CONFIG=1`
remains as an emergency override that overwrites both classes.

### Other UX fixes today

- **LF→CRLF normalize on telnet/SSH emitter (`81c317766`)**. Raw
  TCP clients (`nc`, Mac Terminal without telnet NVT) treat ASCII
  LF as "advance row, keep column" — content stair-steps. Proper
  telnet clients already get NVT-correct output. The normalize is
  idempotent (`\r?\n → \r\n`), no-op for compliant clients. Only
  applies to string emits — binary file-transfer buffers pass
  through untouched.

- **Standing SSH/restart authorization for Claude (`87b8ea3fa`)**.
  Codified in `RULES.md` — Claude can SSH into `bbs.uprough.net`,
  read live state, restart the BBS container, and do targeted
  `default-data → volume` repairs without per-call confirmation.
  Destructive ops (rm -rf on /app/data, DB writes, removing the
  named volume, SSH key/firewall changes) still require explicit
  approval. Also fixed the stale host info (bbs.uprough.net not
  89.167.21.154; ports 64128/31337 not 2323/2222).

### Regression tests added (`d91680017`)

- `tests/utils/acs.util.test.ts` — `bbsRoot resolution` describe
  block. Asserts the BBS_ROOT → BBS_DATA_DIR → cwd fallback chain
  so the prod-only path can't silently regress.
- `tests/handlers/screen-loader-case.test.ts` — structural assertion
  that BBSTITLE / AWAITSCREEN / addAnsiVariants all probe .txt
  before .TXT. Behavioural test isn't viable (APFS hides the bug;
  amigafs.existsSync can't be spied on because TS module objects are
  sealed), so it inspects the source for ordering. If the variant
  builder gets refactored, the regex won't match and the test fails
  loudly.

Both suites verified to fail-without-fix and pass-with-fix.

### Live verification status

All deploys landed cleanly:
- `d1320d624` ACS path fix
- `faa210e66` lowercase-first screen ordering
- `629dc1cdf` IMAGE-OWNED / VOLUME-OWNED sync split
- `91272c522` FRONTEND syscmd on telnet/SSH
- `81c317766` LF→CRLF normalize
- `d91680017` regression tests

User-confirmed working on live:
- BBSTITLE login prompt renders below the ASCII banner (not inside it)

User testing next:
- `j 2` as sysop on telnet/SSH — should now join conf 2 (ACS fix +
  restart picked up ACS.255.info)
- FRONTEND door appearance on telnet/SSH connect

### Out of scope / accepted

- **Wide-terminal layout on Mac Terminal direct connect.** BBS art
  is fixed 80-column; wider terminals show empty right margin. User
  declined to strip ANSI blink (`\x1b[5m`); use SyncTerm / NetRunner
  or resize Mac Terminal to 80 cols for proper retro look.

### Prior sessions archived

- `thoughts/shared/handoffs/2026-05-16_door-bug-batch.md`
- `thoughts/shared/handoffs/2026-05-16_mastermind-deep-dive.md`
- (Prior 2026-05-17 unification refactor section retained in git
  history at commit `fa653d987` — collapsed into the above as the
  unification refactor isn't the day's headline anymore.)
