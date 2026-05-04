# Handoff

## 2026-05-04 — Native AREXX Phase 7: Enqueue + SendIO completion + ReplyMsg(NULL) guard

Three concrete daemon-dispatch fixes — but the daemon still doesn't
invoke the in-rexxsyslib interpreter. tsc clean, 91/91 tests pass.

**What works now** (verified via `dev/scripts/arexx-trace.ts`):
- `Enqueue` (LVO -270) properly inserts into priority-sorted list —
  exec-vectors.ts. Was a stub no-op; the daemon's pending-message
  list stayed empty and RemHead spun on garbage afterwards.
- `SendIO` ReplyMsg's the IORequest immediately (real driver
  semantics) so the daemon's master-port sigBit fires when its
  timer.device IO "completes" — ExecLibrary.sendIO. Without this
  the daemon's Wait(0x6000) after dispatch never woke.
- `ReplyMsg(NULL)` is now a defensive no-op — ExecLibrary.replyMsg.
  AmiExpress RexxMast clears A1 in some dispatch arms; reading
  memory at addr 0+14 was auto-registering a phantom port with
  the wrong sigBit (16/17), corrupting the daemon's signal map.

**What still doesn't work — open question:**
The daemon receives our PutMsg, runs IsRexxMsg/FillRexxMsg/Remove/
Enqueue/ReplyMsg/Permit/SendIO/Wait, then enters a steady-state
RemHead/ReplyMsg/DeleteRexxMsg cleanup loop on garbage pointers
from rexxsyslib's internal data segment (offsets +0x0d8 / +0x25d3
relative to rexxsyslib base 0x200000). The daemon never invokes
rexxsyslib's interpreter, which lives INSIDE the same hunk —
strings dump shows `INTERPRET`, `TRACE`, `ARexx V1.15`, no
separate `rexxc` binary referenced. The `RexxMast` launcher is
2364 bytes; the daemon body is in rexxsyslib's hunk via the
CreateProc trampoline.

To finish the native path someone needs to:
1. Disassemble rexxsyslib.library around the Enqueue→ReplyMsg
   dispatch arm — find the path from "msg enqueued" to
   "interpreter invoked" and identify what signal/condition the
   daemon expects between those two states.
2. Verify our daemon is on the right execution path post-dispatch;
   the constant `0x25d3` in ReplyMsg's A0 looks like a fixed
   data-segment offset that may be a function pointer the daemon
   should be JSR'ing to (interpreter entry?).
3. Possibly we need to actually-fire the timer.device IO with a
   pending IORequest so the daemon's main loop progresses past
   the Wait that the cleanup loop ends in.

**TS interpreter is the production engine.** Real AREXX doors
(AVAIL, SPEEDCHK, SOMEINFO, STNG) render 1:1 through the TS path.
Native is committed-and-progressing but not user-facing.

## 2026-05-04 — DateTime offset fix + TUI overhaul

- `2fe69a2c6` **dos.library DateTime struct-offset bug.**
  `dat_StrDay/StrDate/StrTime` were slot-shifted, so every 68K door
  asking for a date got the time string ("00:00:00") in its date
  buffer. Fixes AquaScan "Scanning dir N for X" + any other door
  using dos.library date conversion.
- `7475fc054` doorman F-explorer handles AmigaDOS assigns +
  case-mismatch (`DOORS:EmP_Tools/Bulls` no longer freezes BBS).
- `8f047b801` AREXX rexxsyslib LVO traps (Phase 2; parallel-agent
  bundle, also absorbed AquaScan path-A removal).
- `45c098000`+`e289bdeca` TUI: F2 restart dialog (raw stdin —
  Ink swallows F-keys); tmux send-keys to `:.{right}`; raw-mode
  leak fix; `stty sane` guard in `--help`; backend log to bottom-
  left pane (full-height TUI on right); Logs `/`-filter +
  arrow/PgUp/PgDn scrollback + `g`/`G` top/tail.
- `9f636c9d4` aquascan-trace plumbing ripped post-fix; tree clean.

## 2026-05-04 — Native AREXX Phase 6 (boot READY)

Boot path verified: ExecBase / exception vectors / 297 LVO traps /
RexxMast Process struct / CreateProc trampoline / LoadSeg override
for dynamically-loaded daemons / OpenDevice timer.device override.
`runUntilReady → true`, `AddPort("AREXX")` observed. The launcher
spawns the daemon in our singleton via the trampoline (no scheduler
needed — we just switch PC into seg 1).

Discovery: `RexxMast` is a 2364-byte launcher; the actual
interpreter (`INTERPRET`, `TRACE`, `ARexx V1.15` strings) lives
INSIDE `rexxsyslib.library`. There's no separate `rexxc` binary on
this version. The daemon's CreateProc target IS rexxsyslib's
hunk. Phase 7 work needs to find the dispatch arm from
"msg enqueued" → "interpreter invoked" inside that hunk.

TS interpreter is the production engine; real AREXX doors (AVAIL,
SPEEDCHK, SOMEINFO, STNG) render 1:1. AnsiSKiP installed at
`Doors/AnsiSkip/`; `door.handler.ts` routes AIM/XIM/SIM/TIM/IIM
with .rexx/.rx LOCATIONs through `executeARexxDoor`.

Diagnostic: `dev/scripts/arexx-trace.ts` boots the singleton in
isolation and dumps the first 100 library calls.

## How to run

```
./dev/scripts/start-servers.sh --bbs-only   # BBS terminal only
./dev/scripts/start-servers.sh              # full: BBS + Admin + SDK
./dev/scripts/kill-servers.sh               # stop everything cleanly
```

Tests: `SKIP_DB_INIT=1 npm test -- --testPathPattern="(rexx|arexx)"`

Sysop: `System/RexxMast` + `System/Rexxc/` are gitignored
(Commodore copyright); sysops drop their own. `Libs/rexxsyslib.library`
is in repo. Toggle `AREXX_ENGINE=auto|native|ts` in `bbsConfig.info`.
`AREXX_TRACE=1` for debug.

## Open priorities

- **#78 native AREXX end-to-end smoke test** — ship a minimal script
  through `executeRexxScript()` to validate the host-port round trip.
- **#77** AREXX TS interpreter (DONE; native is alt path)
- **MCI parser: 1:1 with express.e tokenizer.** Our `screen.handler.ts`
  substitutes MCI codes via a regex pipeline
  (`parsed.replace(mciRegex('N'), ...)`). Express.e's `processMciCmd`
  (lines 5258-5410) is a single-pass tokenizer: see `~`, eat optional
  3-digit width prefix, scan for next space OR `|` terminator,
  exact-match the extracted command against an if/else chain. Real
  impact: `Screens/Logon24hrs.txt` writes `~N.` with no `|` — our
  regex sees the `.` as a non-match and falls through, leaving `~N`
  literal in the output. Refactor target: port `processMci` /
  `processMciCmd` to TypeScript and replace the regex pipeline +
  every other ad-hoc MCI substituter (door.handler.ts:2735's
  `~CL.`/`~N|` notes, batch-scheduler.ts:170 basic MCI). Validate
  against express.e:5258-5410 (LVO list), :5769-5802 (main loop),
  :6810 (line-mode invocation site).

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
- **Message storage**: body at `<conf>/MsgBase/<id>` (no extension,
  raw body, `\n`). HeaderFile + MailStats authoritative.
- **`mailStat.highMsgNum`** stores *next* id; total = high-1.
- **`confMailName`** for "is this my mail?" checks, NOT
  `session.user.username`. Use `getConfMailName(session)` or
  `getConfMailNameFor(user, confId, msgBaseId)`.
- **`~SP` in screens**: `displayScreen` handles pause + resume.
- **`relConfNum`** drives menu prompt + conftop, not `currentConf`.
- **`_fallback` .info files**: `writeInfoFile` throws on these.
- **High-bit bytes**: route screen/bulletin reads through
  `readAmigaTextFileWithTransforms`. `fs.readFileSync(p, 'utf8')`
  silently corrupts 0xB7/0xA9/0xAE.
- **Uploads via HTTP**, not websocket.
- **Mouse-move throttled** at socket boundary (60Hz per session).
- **`SKIP_DB_INIT=1`** breaks `message-pointers` /
  `message-scan-parity` / `message-repository`.
- **AREXX native**: `RexxMast` + `Rexxc/` gitignored (Commodore
  copyright); sysops supply their own.
