---
date: 2026-05-03
topic: conftop double-banner fix + open backlog
tags: [emulation, xim, dos-library, conftop, doors]
status: implemented
---

# 2026-05-03 — Conftop double-banner fix (XIM stdout suppression)

## What was done

One commit: `8abcb6082` — `fix(emulation): suppress DOS stdout writes for XIM-protocol doors`.

`web/backend/src/amiga-emulation/LibraryManager.ts:563-589` — the
`setOutputRawCallback` and `setOutputCallback` wired to `dosLibrary` now
discard writes when `useXimProtocol === true`. SIM/SUP doors are
unchanged. Transfer-raw passthrough preserved in both branches.

## Background

User reported on 2026-04-29:
- Conftop renders the version banner TWICE in our emulator.
- Verified on a recorded video of real Sanctuary BBS that it renders ONCE.
- Suspected hypotheses: file lookup miss, double launch, race condition.

After several rounds of investigation we found the binary genuinely emits
the banner from two distinct code paths:

1. **Startup banner** (offset 21081 in `Conftop020.x`) — printf via
   DOS `Write(Output(), ...)`. Followed by `"Conftop v2.3"` version line and
   `"%10s %12s"` format strings.
2. **Report-header banner** (offset 21699 in same binary) — emitted via
   `AEDoor.library` `JH_PUTSTR`. Followed by `[32mDay (` line.

On real Amiga AmiExpress launches XIM doors with `Output()` pointed at NIL:
(or equivalent), so banner #1 goes nowhere — only banner #2 reaches the
user via JH messages. Our `LibraryManager` was forwarding ALL DOS stdout
writes directly to the user's socket via `socket.emit('ansi-output', ...)`,
unconditionally for all door types.

## Fix details

```ts
// LibraryManager.ts:553-589 (post-fix)
const stdoutGoesToUser = !useXimProtocol;
this.dosLibrary.setOutputRawCallback((buf: Buffer) => {
  if (bbsSession.transferRawActive) {
    this.socket.emit('transfer-raw:echo', buf);
    return;
  }
  if (!stdoutGoesToUser) {
    return;  // XIM door — drop CLI/stdout writes silently
  }
  // ... existing forward logic
});
```

`useXimProtocol` is computed at line 489 as
`doorType !== "SIM" && doorType !== "SUP"`. So:

| doorType | useXimProtocol | stdout → user? |
|---|---|---|
| XIM, AIM, TIM, IIM, MCI, AEM | true | **NO** (silenced) |
| SIM, SUP | false | YES (kept for compatibility) |

Transfer-raw mode (`bbsSession.transferRawActive === true`) routes binary
bytes to `transfer-raw:echo` regardless of door type — no behavioural
change.

## Critical file references

- `web/backend/src/amiga-emulation/LibraryManager.ts:489` — `useXimProtocol` computed
- `web/backend/src/amiga-emulation/LibraryManager.ts:553-589` — output callback wiring with new filter
- `web/backend/src/amiga-emulation/api/DosLibrary.ts:1099-1124` — Write() console-output path that fires the callback
- `web/backend/src/amiga-emulation/DoorLoader.ts:213` — OVERCLOCK default (`?? 100`)
- `web/backend/src/utils/amiga-command-parser.util.ts:574-583` — OVERCLOCK tooltype parsing

## Verification

Manual test:
1. `./dev/scripts/kill-servers.sh && ./dev/scripts/start-servers.sh --no-watch`
2. Login, run `top` (CONFTOP).
3. Banner should render ONCE, followed by the report (Conference, Day, table, stats).

Should also fix any other XIM door whose 68K source printf's debug/status
to stdout — those bytes were leaking to the user terminal previously.

If a SIM/SUP door later breaks because its banner doesn't appear, this
filter doesn't apply to those types — different code path, would be a
distinct issue.

## Discussion that informed the fix

User initially proposed removing `OVERCLOCK=100` from divergent .info files. I
investigated and found OVERCLOCK is functional in our emulator (CPU emulation
speed multiplier per `DoorLoader.ts:213`, default 100x). Sanctuary doesn't
have OVERCLOCK because real Amiga runs 68000 natively at 7 MHz — they don't
need software emulator compensation.

Recommendation: **keep OVERCLOCK=100 in our icons**. They match the current
`?? 100` default but document the intent explicitly. Removing them is a no-op
today but loses information.

The conftop double-banner is **not** a 100x-overclock side-effect (modem
throttle queues bytes regardless of how fast they're generated). It's the
DOS stdout leak described above.

## Open backlog from before today

1. **DOORSMENU argc mystery** — earlier in 2026-05-03 session. `[DIAG]`
   probe placed at PC=0x32e8 in `DoorLifecycleManager.ts:~990`. Not yet
   tested. SAS/C startup pushes argc from BSS 0x9874 onto stack; main()
   at 0x32e8 checks `if (argc < 2) exit`. Parser sets argc=2 correctly
   (proven by `AllocVec(12)`) but main() still exits as if argc < 2.

2. **info-editor delete silently broken** — `delete <KEY>` reports
   `[OK] Tooltype <KEY> deleted` but re-parsing the file still shows the
   tooltype `[ENABLED]`. Repro: `Doors/5D-User/5D-User.info` with
   `OVERCLOCK`. Suspect the `_fallback` binary write-back path in
   `web/backend/src/utils/info-file.util.ts:writeInfoFile` rewrites the
   raw original bytes when `_fallback === true`. Verify by inspecting
   that flag for these icons.

3. **13 divergent door icons vs Sanctuary reference** — 11 cosmetic
   (`OVERCLOCK=100`), 2 substantive:
   - **ByteKiller** — NUKER.1=sysop vs sandman, SPY_LIST=<x>,
     FREEDOWNLOAD ordering, missing `LOG_DAYS=10` in ours,
     `(NUKER.2=ARGON)` etc disabled in ref but absent in ours.
     Installation-specific config — user decision.
   - **Request** — `WORK:Doors/Request/...` paths vs
     `WORK:BBS/Doors/Request/...` in reference. Also
     installation-specific.

   Both should be left to user direction; not auto-fixed.

4. **doorman "Cannot read directory"** on archive listing — needs repro.

5. **DoorLifecycleManager.ts** at 2020 lines — refactor candidate.

6. **LOGON24 screen** — optional stylized variant.

## Learnings

- **Door types matter for DOS stdout routing.** AmiExpress on real Amiga
  launches XIM/AIM/etc with stdout pointed at NIL:; only the AEDoor JH
  messages reach the user. Software emulation has to mirror that or
  binaries that incidentally printf to stdout will leak debug/banner
  output to the BBS terminal.

- **Modem throttling and CPU overclocking are independent.** Throttle
  queues output bytes to the wire at the configured speed. CPU overclock
  affects how fast the door GENERATES bytes. Even at 100x CPU and 56k
  modem, the user still sees 56k worth of bytes per second — but ALL the
  bytes the door generates eventually reach them.

- **`OVERCLOCK` tooltype is functional in our emulator**, not cosmetic.
  Default is 100x via `DoorLoader.ts:213`. Removing per-door OVERCLOCK
  values currently changes nothing but loses explicit configuration.

## Artifacts

- Commit: `8abcb6082`
- Compact handoff: `handoff.md` (top entry "2026-05-03 — Conftop double-banner fix")
- Investigation thread spans the 2026-04-29 → 2026-05-03 sessions; was
  blocked by intermediate emulation work (env vars, dos.library vectors,
  AllocVec/FreeVec). Several of those commits may have indirectly helped
  conftop register correctly so we could see the original double-banner
  symptom clearly.

## Next steps

1. **Test conftop on running BBS** — not yet verified end-to-end since
   the fix landed.
2. Decide on info-editor `_fallback` write-back fix (open #2).
3. Ask user about ByteKiller and Request divergences (open #3).
4. DOORSMENU argc probe + cleanup (open #1).
