# Handoff

## 2026-05-04 (late) — S/stats door + empty BULL stubs

- `a0d79fc41` **S/stats SAS-C "Stack Overflow" panic.** DoorLoader's
  simulated JSR shifted SP down by 4 to push the exit-trap return addr
  but only seeded `stack_size` at the OLD `SP+4`. After the shift, `4(SP)`
  pointed at exit-trap (0x1ff000) instead of stack_size, so the SAS-C
  watermark `SP - 4(SP) + 0x80` wrapped to ~0xffe5xxxx and every
  `cmpa.l 0x728(a4),a7` prologue check false-tripped → AutoRequest("**
  Stack Overflow **") → exit FAIL=20. Fix: write `stack_size` at the NEW
  `SP+4` after the JSR push. Also raised the stack floor from 4KB to
  256KB unconditionally (.info STACK= 20000 / 30-50KB was too tight for
  the watermark math). 11-test regression suite at
  `tests/amiga-emulation/door-loader-stack-bounds.test.ts`. Affects ANY
  SAS-C-built door, not just stats.
- **Empty BULL/NODE_BULL/CONF_BULL stubs.** `ensureRootScreens()` in
  `services/file-areas-loader.ts` was creating 0-byte placeholders for
  these three after every boot. Express.e treats them as "open succeeded
  → call doPause()" — sysop saw a press-enter prompt with nothing above
  it. Removed BULL/NODE_BULL/CONF_BULL from the required-screens list;
  bulletin display is opt-in (sysop drops a populated file when desired).
  Also deleted ~52 existing 0-byte stubs across `Conf*/Screens/` and
  `Node*/Screens/`.

## 2026-05-04 — Native AREXX Phase 7: Enqueue + SendIO completion + ReplyMsg(NULL) guard

Three concrete daemon-dispatch fixes — but the daemon still doesn't
invoke the in-rexxsyslib interpreter. tsc clean, 91/91 tests pass.

**What works now** (verified via `dev/scripts/arexx-trace.ts`):
- `Enqueue` (LVO -270) properly inserts into priority-sorted list
  (was a stub no-op; daemon's pending-message list stayed empty).
- `SendIO` ReplyMsg's the IORequest immediately (real driver
  semantics) so the daemon's master-port sigBit fires.
- `ReplyMsg(NULL)` is now a defensive no-op; AmiExpress RexxMast
  clears A1 in some dispatch arms.

**Open question (not blocking):** the daemon receives our PutMsg, runs
the dispatch chain, then enters a steady-state cleanup loop on garbage
pointers from rexxsyslib's data segment. Never invokes the interpreter
inside the same hunk. Next-session work: disassemble rexxsyslib around
the Enqueue→ReplyMsg path; identify the signal/condition for
"interpreter invoked"; possibly fire a real timer.device IO.

**TS interpreter is the production engine.** Real AREXX doors (AVAIL,
SPEEDCHK, SOMEINFO, STNG) render 1:1 through the TS path.

## 2026-05-04 — DateTime offset fix + TUI overhaul

- `2fe69a2c6` dos.library `dat_StrDay/StrDate/StrTime` were slot-shifted,
  so every 68K door asking for a date got the time string ("00:00:00")
  in its date buffer. Fixes AquaScan + any DateToStr/StrToDate user.
- `7475fc054` doorman F-explorer handles AmigaDOS assigns + case-mismatch.
- `45c098000`+`e289bdeca` TUI: F2 restart dialog (raw stdin — Ink
  swallows F-keys); tmux send-keys to `:.{right}`; raw-mode leak fix;
  `stty sane` guard in `--help`; backend log to bottom-left pane (full-
  height TUI on right); Logs `/`-filter + arrow/PgUp/PgDn scrollback +
  `g`/`G` top/tail.
- `077f4e87c` D command flagged-files listing 1:1 with express.e:12736;
  U command (G)oodbye-after-transfer flag honored on empty batch.

## How to run

```
./dev/scripts/start-servers.sh --bbs-only   # BBS terminal only
./dev/scripts/start-servers.sh              # full: BBS + Admin + SDK
./dev/scripts/kill-servers.sh               # stop everything cleanly
```

Tests: `SKIP_DB_INIT=1 npm test -- --testPathPattern="<name>"`

Sysop: `System/RexxMast` + `System/Rexxc/` are gitignored (Commodore
copyright); sysops drop their own. `Libs/rexxsyslib.library` is in
repo. Toggle `AREXX_ENGINE=auto|native|ts` in `bbsConfig.info`.
`AREXX_TRACE=1` for debug.

## Open priorities

- **MCI parser 1:1 with express.e tokenizer.** Our `screen.handler.ts`
  substitutes MCI codes via a regex pipeline. Express.e's `processMciCmd`
  (lines 5258-5410) is a single-pass tokenizer: see `~`, eat optional
  3-digit width prefix, scan for next space OR `|` terminator. Real
  impact: `Screens/Logon24hrs.txt` writes `~N.` with no `|` — our regex
  sees the `.` as a non-match and falls through, leaving `~N` literal.
  Port `processMci` / `processMciCmd` to TS, replace the regex pipeline
  + ad-hoc substituters in `door.handler.ts:2735` and
  `batch-scheduler.ts:170`.
- **Native AREXX end-to-end smoke test** once the rexxsyslib interpreter
  invocation arm is identified (Phase 7+).
- **doorman "Cannot read directory"** — needs user repro path.

## Known WEB_ deviations (intentional)

- Line-mode vs char-mode; no HYDRA bidirectional transfer
- `2` (callers log): DB entries not per-node files
- ZOOM auto-selects ZIP; no LHA binary
- GDPR gate on new user
- File scan at login gated on `SHOW_NEW_FILES`
- `lowestNotDel` recomputed from headers (express.e just bumps +1)
- EH preserves 'p' (censored) status (express.e forces 'P')
- ZModem `Msg. Options X` replaced by F file-attach

## Gotchas

- **Amiga = BE**: QWK/LZH/SAUCE are LE.
- **Message storage**: body at `<conf>/MsgBase/<id>` (no extension, raw
  body, `\n`). HeaderFile + MailStats authoritative.
- **`mailStat.highMsgNum`** stores *next* id; total = high-1.
- **`confMailName`** for "is this my mail?" checks, NOT
  `session.user.username`.
- **`~SP` in screens**: `displayScreen` handles pause + resume.
- **`relConfNum`** drives menu prompt + conftop, not `currentConf`.
- **`_fallback` .info files**: `writeInfoFile` throws on these.
- **High-bit bytes**: route screen/bulletin reads through
  `readAmigaTextFileWithTransforms`. `fs.readFileSync(p, 'utf8')`
  silently corrupts 0xB7/0xA9/0xAE.
- **Uploads via HTTP**, not websocket.
- **Mouse-move throttled** at socket boundary (60Hz per session).
- **`SKIP_DB_INIT=1`** breaks message-pointers / message-scan-parity /
  message-repository test files.
- **AREXX native**: `RexxMast` + `Rexxc/` gitignored.
- **Door stack default = 256KB floor** (DoorLoader.computeStackBounds).
  AmiExpress `.info` STACK= values smaller than 256KB are clamped up;
  the SAS-C watermark math needs the headroom.
