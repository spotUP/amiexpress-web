# Handoff

## 2026-05-05 — AREXX engine COMPLETE (KickBox + STNG + AVAIL run end-to-end)

Final pass on AREXX support — three real shipped doors verified
end-to-end through the native engine path. Coverage at parity with
RKRM "Using ARexx" §5 + Aedoc4 §Cap1102.

**Wiring (all commits between c9e13e5d0 .. 27d77c83d):**

  Bug fixes uncovered by KickBox / STNG bring-up:
  - `c917f7232` Showfile uses dataDir + CALL parses `name(args)` form
  - `74e6f2489` Showfile normalises `\n → \r\n` (Amiga screens)
  - `e8fc317fe` CALL `routine arg1, arg2` comma-separated args
  - `e81b869ed` SENDFILE alias for SHOWFILE
  - `c9e13e5d0` GetUser time fields return raw seconds (not /60)
  - `624689ebf` evaluateCondition handles `|` / `&` compound conditions
  - `130b53a02` paren-wrapped IF + REMOVERESERVED + silent ADDRESS COMMAND

  New features:
  - `86305b165` Ctrl+C aborts running scripts at input prompts
                (with `signal on halt` trap support)
  - `27d77c83d` DROP / INTERPRET statements + B2C/C2B/XRANGE/DIGITS
                builtins + LINEIN/LINEOUT/CHARIN/CHAROUT/STREAM
                file I/O alt API + SIGL automatic var

**Coverage:** 79 of 79 RKRM-required builtins, all 7 Aedoc4 host
commands, every AmiExpress AREXX dialect feature shipped doors use:
PARSE forms, DO loops (FOREVER/WHILE/UNTIL/count/var=), nested IF
DO/END, SELECT/WHEN/OTHERWISE, CALL label/`func()`/comma-args,
SIGNAL ON/OFF/VALUE/label, RETURN/EXIT, ADDRESS, DROP, INTERPRET,
all comparison and logical operators with REXX precedence,
compound stems (multi-level), automatic vars (SIGL/RC/RESULT/ADDRESS).

**Doors verified working:**
- AVAIL.rexx (sysop availability) — render 1:1 byte-for-byte
- SPEEDCHK.rexx (login speed test) — full flow
- SOMEINFO.rexx (BBS info dump) — RexxOpt one-line build
- STNG.Rexx (Star Trek TNG trivia, 313 lines) — title, menu,
  instructions, hi-scores, question loop with ans.i.index 3-level
  stems, Quit + signal BEGIN looping
- KickBox.Rexx (1994 boxing game, 951 lines) — title screen, new
  fighter setup, stats record, main menu prompt, training match,
  Options menu (incl. all four options), end-game cleanup with
  ADDRESS COMMAND deletes, RemoveReserved username sanitisation,
  3-level compound stems for fighter/answer data, do until eof
  read loops, multi-level signal-up-out-of-WHEN-DO

**Architecture:** real Commodore RexxMast / rexxsyslib binaries
boot under MOIRA + run through `LibInit` (calls rexxsyslib's own
init function); script dispatch uses real `CreateRexxMsg` / `PutMsg`
ABI handshake then bridges to TS interpreter for execution
(daemon's internal dispatch arm needs assembly-level RE that's
not in scope). Engine selector picks `native` automatically when
binaries are present + parseable.

**Daemon-driven dispatch (HLE bridge landed 2026-05-11):**
Fix 1 (counter zeroing) + Fix 2 (task-spawn fields) from 2026-05-10
got the daemon through PutMsg→GetMsg→dispatch→CreateProc. RXC
turned out to be a 372-byte CLI helper, not the interpreter (which
lives inside rexxsyslib). 2026-05-11 wired the HLE bridge:
phantom rexxc MsgPort allocated at start() (port at task_base+0x5C
so daemon's `lea -0x5c(a0),a0` resolves correctly), CreateProc
override detects rexxcSegListBptr and returns the phantom port —
daemon's post-CreateProc PutMsg lands the RexxMsg in our queue.
`executeRexxScript()` now drives the daemon dispatch loop, GetMsgs
from the phantom port, runs the TS interpreter asynchronously,
writes rm_Result1/rm_Result2/rm_Args[1], ReplyMsg's to rm_ReplyPort,
post-burst drives the daemon back to WaitPort, then cleans up.
Bridged fallback preserved for any path the daemon doesn't reach
within the cycle budget. Verified end-to-end on a real
RexxMast/rexxsyslib/RXC + AROS ROM stack: probe in
`dev/scripts/arexx-hle-probe.ts` reports `CreateProc(seg=0x1000) A2=msg
→ phantomPort`, executeRexxScript round-trips in 974ms with
`rm_Result1=0`. CI regression in
`tests/services/native-arexx-daemon.test.ts` (6 tests, gated on
binaries+ROM). All 114 rexx/arexx tests green in 2.77s; tsc --noEmit
clean. LVO -462 from the spawn-rexxc disasm (jsr -0x1ce(a6) post
exg a5,a6) is not reached in the daemon's actual post-CreateProc
path — round-trip completes without stubbing it.
Full design + disasm: `thoughts/shared/research/2026-05-10_arexx-daemon-dispatch-wedge.md`,
handoff: `thoughts/shared/handoffs/2026-05-11_arexx-daemon-hle-bridge.md`.
- Ctrl+C in tight loops between input prompts (rare; needs
  per-clause flag check)
- Arbitrary-precision arithmetic for `NUMERIC DIGITS` (decorative
  for now; JS doubles for math)

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

- **MCI tokenizer follow-on cleanup (DONE — was stale).** Audit
  confirmed color/bg (`c0..c7`, `b0..b7`, `z0..z7`), FC/FF/FL/AK/CR/
  NS, `~SP`, `~f`, `~w`, `~q`, `~h`, `~n1..n9`, `~x<n>`, `~y<n>` are
  all routed through `userInfoDispatch` / `prefixDispatch` at
  `screen.handler.ts:693-839`. `door.handler.ts:2749` uses
  `parseMciCodes`; `batch-scheduler.ts:181` uses the shared
  tokenizer. No ad-hoc `mciRegex` substituters remain. See
  `thoughts/shared/handoffs/2026-05-04_mci-tokenizer-followup.md`.
- **Native AREXX end-to-end smoke test (DONE 2026-05-10).** Promoted
  `dev/scripts/arexx-trace.ts` to `tests/services/native-arexx-smoke.test.ts`.
  Suite is gated on the presence of `System/RexxMast`, `Libs/rexxsyslib.library`,
  and a Kickstart or AROS ROM under `data/amiga-roms/` — skips
  cleanly in CI (binaries gitignored), runs in full on a sysop's
  local checkout. Covers `start()` boot, `runUntilReady()`, a
  trivial `RETURN 0`, and SAY output capture through the
  outputCallback path. 5 tests, all green locally.
- **Ctrl+C in tight AREXX loops (DONE 2026-05-10).** `scriptAbortHandler`
  now lives on `BBSSession`; AREXX `executeScript` installs it for
  the script's duration, and both socket-handlers `command` channel
  and the telnet input path route 0x03 through it regardless of
  whether a `doorInputHandler` is currently registered. The interpreter
  picks up `returnRequested`/`exitRequested` at the next clause
  boundary, so KickBox/STNG-style CPU loops between input prompts
  abort cleanly. Regression: `tests/services/arexx-ctrlc-abort.test.ts`.

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
