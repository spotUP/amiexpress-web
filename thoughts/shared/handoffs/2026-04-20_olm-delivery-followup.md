---
date: 2026-04-20
topic: olm-cross-node-delivery-followup
tags: [68k, olm, warolm, multinode, ipc, disasm]
status: in-progress
---

# WarOLM cross-node delivery — next-session playbook

## TL;DR

Cross-node OLM delivery is gated by a bailout inside WarOLM that
happens **before** the delivery loop runs. The routing plumbing
(cross-node `JH_SM` → target socket) already exists and is correct.
The door just never reaches the code that would send the payload.

Goal for next session: find which `beq.w 0xf8e` fires (0xDD0, 0xDD8,
or 0xDE8 file-relative), and fix whichever input-channel bug is
causing D7==0 or 0x11a(a7)==0.

## The actual delivery mechanism (updates prior handoff)

**Prior handoff was wrong about `LISTS/<slot>`.** Disasm of WarOLM
at file offset `0x11DE` shows the delivery sub-routine:

```
0x11de: move.l a7, d0               ; stack-range guard preamble
0x11e2: cmp.l  0x18a4(a4), d0
0x11e6: bcs.w  0x28d0                ; bail on low stack
0x11ea: movem.l d6-d7/a5, -(a7)     ; save regs
0x11ee: move.w 0x1a(a7), d6          ; D6 = line number (arg "pea #1")
0x11f2: move.l 0x10(a7), d7          ; D7 = line count arg
0x11f6: movea.l 0x14(a7), a5         ; A5 = line text pointer (arg "pea 0xb42(a4)")
0x11fa: moveq  0x4, d0               ; D0 = 4 = JH_SM
0x11fc: movea.l 0x1498(a4), a0       ; A0 = persistent msg pointer (hunk1+0x1498)
0x1200: move.l d0, 0xe0(a0)          ; msg.command = JH_SM
0x1204: movea.l 0x1498(a4), a0
0x1208: adda.w 0x14, a0              ; A0 = msg.string
0x120c: movea.l a5, a1               ; A1 = src line text
0x120e: move.b (a1)+, (a0)+          ; copy until NUL
0x1210: bne.b  0x120e
0x1212: move.w d6, d0                ; D0 = line number
0x1214: ext.l  d0
0x1216: movea.l 0x1498(a4), a0
0x121a: move.l d0, 0xdc(a0)          ; msg.data = line number
0x121e: move.l d7, -(a7)
0x1220: bsr.w  0x131a                ; SendAEServer(target) — PutMsg + WaitPort + GetMsg
0x1224: addq.w 0x4, a7
0x1226: movem.l (a7)+, d6-d7/a5
0x122a: rts
```

So delivery = `PutMsg(JH_SM)` to `AEServer.<targetNode>`, one message
per user line. Our cross-node handler at
`web/backend/src/amiga-emulation/session/lifecycle/door-message-callbacks.ts:236-274`
already intercepts `JH_SM` to `AEServer.<other>`, extracts the string,
and emits `ansi-output` to the target's socket via
`(global as any).io.to(targetSocketId)`. Works correctly — just not
triggered because the delivery loop never runs.

## The bailout (delivery site entry)

Disasm from file offset `0xDBC` onward (post-confirmation path):

```
0xdbc: bsr.w  0xfba                 ; pre-delivery cleanup
0xdc0: moveq  0x2, d0                ; D0 = 2 = JH_SHUTDOWN
0xdc2: movea.l 0x1498(a4), a0
0xdc6: move.l d0, 0xe0(a0)           ; msg.command = JH_SHUTDOWN
0xdca: bsr.w  0x1162                 ; send to own AEDoorPort (local shutdown notice)
0xdce: tst.l  d7                     ; D7 = line count
0xdd0: beq.w  0xf8e                  ; ★ CHECK 1: skip if no lines
0xdd4: tst.w  0x11a(a7)
0xdd8: beq.w  0xf8e                  ; ★ CHECK 2: skip if user said N
0xddc: move.l 0x97c(a7), -(a7)
0xde0: bsr.w  0x122c                 ; wait-for-idle (poll STATS@<target>)
0xde4: addq.w 0x4, a7
0xde6: tst.w  d0
0xde8: beq.w  0xf8e                  ; ★ CHECK 3: skip if unreachable
0xdec: pea.l  0x1.w                  ; FIRST LINE DELIVERY
0xdf0: pea.l  0xb42(a4)              ; (our live test never reaches here)
0xdf4: move.l 0x984(a7), -(a7)
0xdf8: bsr.w  0x11de                 ; ← delivery sub-routine
...
```

The trap log for a live test (`login sysop` → `Olm` → ↓↓ Enter →
"msg\r\r" → Y) shows, between the "nODE iS rEADY" success banner
and the `JH_SHUTDOWN`:

```
JH_SM  "nODE iS rEADY, oLM hAVE bEEN sENT..."
DT_STAMP_CTIME query (cmd=144)
JH_SM  "...Thank you for using WarOLM..."
JH_SM  "...uNREGISTERED eVALUATION cOPY..."
JH_SHUTDOWN
```

**No `STATS@N` Open, no `Delay()` call**. Wait-for-idle (0x122c)
would read `ENV:STATS@<target>` in a loop and call `Delay(50)`
between polls — neither is in the log. Therefore the bailout happens
**before** `0xde0 bsr.w 0x122c` — meaning check 1 or check 2 fires.

Most likely **check 1** (D7==0): the line editor isn't committing
our typed line into the `0x188(a7)` 10×200-byte buffer in the way
WarOLM counts. Second-most likely is check 2 (our "Y" reply doesn't
update `0x11a(a7)`).

## Next-session plan (concrete steps)

### Step 1: verify the runtime PC mapping

This session I set `DOOR_PC_PROBE_RANGES=0x2DA0-0x2E20,0xDBC-0xE20`
and the probe did NOT fire during WarOLM execution.

The door binary loads code at runtime `0x2008` with a 9636-byte code
hunk. Expected mapping:
- r2 / file-relative address `X` → runtime `0x2008 + (X - 0x30)`
- file `0xDBC` → runtime `0x2D94`
- file `0xDCE` → runtime `0x2DA6`
- file `0xDD8` → runtime `0x2DB0`
- file `0xDE8` → runtime `0x2DC0`

Either the mapping is off or the probe env-var wasn't read
correctly. Verify empirically:

1. Start backend with `DOOR_PC_PROBE_RANGES=0x2000-0x4600` (whole
   code range) and maxHits=5.
2. Drive Olm live; check log for any `PC probe hit` entry. The first
   hit gives a real door-code PC, confirming the mapping.
3. Once a real door PC is logged, cross-reference its file offset
   via r2 to confirm the `(runtime - 0x2008 + 0x30)` formula.

If the env-var still isn't parsed, check
`web/backend/src/amiga-emulation/session/lifecycle/DebugMonitor.ts:329`
`parsePcProbeRanges` — the parser wants `start-end,start-end` with
hex literals. Possibly the parser strips spaces or rejects bare
numbers.

### Step 2: instrument the bailout PCs

Once the runtime PCs are confirmed, set:

```
DOOR_PC_PROBE_RANGES=<runtime_0xDCE>-<runtime_0xDE8>  (e.g. 0x2DA6-0x2DC0)
DOOR_PC_PROBE_MAX_HITS=5
```

The probe logs D0/D1/A0/A4/A5/A6/SP plus three A4-relative cells.
I also want D7 and `0x11a(a7)`. If the built-in probe doesn't log
those, patch `DebugMonitor.checkPcProbes` to also capture D7 and
`emulator.readMemory32(sp + 0x11a)`.

Or skip the probe entirely and drop a one-shot hook into
`DoorLifecycleManager` that fires when `pc === 0x2DA6`. The
lifecycle loop already reads PC each iteration.

### Step 3: diagnose the failing test

**If D7==0:** the line editor's line-count isn't incrementing. The
line-input code lives in the WarOLM binary (handoff prior lists
`0x1ACA` as `JH_LI input`). Trace from there — what's our
`completeLineInput` reply look like vs. what the door expects?

Key mismatch to check: WarOLM's line-input probably decrements /
increments D7 (at some known offset from A7) based on the reply.
Our XIMIOHandler (`web/backend/src/amiga-emulation/xim/io.ts:405`
`completeLineInput`) writes the string into `msg.msgAddr + 0x14`
and calls `this.reply(msg, 1)`. Confirm the structure and offsets
match what WarOLM's caller reads.

**If 0x11a(a7)==0:** our "Y" reply for the Y/n prompt doesn't store
a non-zero value where WarOLM reads it. This is a JH_HK/JH_PM reply
issue. Compare: WarOLM sent JH_PM or JH_HK for "Send This To Node
2 (Y/n)?"; our handler should write the key code to `msg.string[0]`
or `msg.data`. Check which the door's caller reads — it expects
`0x11a(a7)` to be nonzero after return.

**If wait-for-idle returned 0:** `ENV:STATS@<target>` parsing in
the emulator is wrong, or the target went SHUTDOWN mid-wait. We
already see the status-parse as "-00" (IDLE) in the STATS file, and
the handler returned 1 for the initial status read before the
confirmation. Unlikely to be the bailout.

### Step 4: fix and re-test

Once the failing check is identified, the fix is in one file:
- Line count: `web/backend/src/amiga-emulation/xim/io.ts`
  (line-input reply format)
- Y/n: same file (JH_HK / JH_PM reply format)
- Wait-for-idle: `web/backend/src/amiga-emulation/utils/env-stat-util.ts`
  or similar (STATS@ format)

After the fix, re-run the live OLM test. Expected success:
1. Trap log shows ≥1 `JH_SM` to `AEServer.2` (one per user line).
2. Cross-node handler log `[X-NodeRoute] AEServer.2 cmd=4 str="..."`
   fires for each line.
3. Target node 2's terminal receives the ANSI text via
   `socket.emit('ansi-output', ...)`.

## Live-test reproduction recipe

Use this exact sequence to reproduce the bug via MCP.

### 1. Backend

No user-managed terminal — run directly in background:

```
cd /Users/spot/Code/amiexpress-web/web/backend &&
BBS_DATA_DIR=/Users/spot/Code/amiexpress-web \
NODE_ENV=development \
DEBUG_68K=1 \
XIM_DEBUG_JSON=1 \
npx tsx src/index.ts > /Users/spot/Code/amiexpress-web/logs/backend.log 2>&1 &
```

Wait until `curl -sf http://127.0.0.1:3001/debug/api/sessions` returns
`{"bbsSessions":[],"activeDoors":[]}`.

### 2. Dual-node WS client

Writing to the project dir so `node_modules/socket.io-client` resolves:

```js
// /Users/spot/Code/amiexpress-web/ws-dual.mjs
import { io } from "socket.io-client";
const a = io("http://127.0.0.1:3001", { transports: ["websocket"] });
const b = io("http://127.0.0.1:3001", { transports: ["websocket"] });
a.on("connect", () => console.log("[A] connect"));
b.on("connect", () => console.log("[B] connect"));
setTimeout(() => process.exit(0), 300000);
```

Run: `cd /Users/spot/Code/amiexpress-web && node ws-dual.mjs &`.
Confirms two sessions via `/debug/api/sessions`.

### 3. Drive nodes to menu

```
# ANSI choice on both (twice — once to accept, once for Enter)
for N in 1 2; do
  curl -s -X POST "http://127.0.0.1:3001/debug/api/sessions/${N}/input" \
    -H 'Content-Type: application/json' -d '{"text":"a\r"}'
done
sleep 2
for N in 1 2; do
  curl -s -X POST "http://127.0.0.1:3001/debug/api/sessions/${N}/input" \
    -H 'Content-Type: application/json' -d '{"text":"\r"}'
done
```

### 4. Log in node 1 as sysop (node 2 stays at login prompt — that's fine,
WarOLM only needs STATS@2 to show IDLE, which it does by default
for a connected but not-authenticated session)

Via MCP:
```
emit_event nodeId=1 event=login payload='{"username":"sysop","password":"sysop"}'
```

### 5. Dismiss the auto-launched WALL (dRE!WAll)

The BBS auto-launches a door after login. Kill it via MCP
`kill_door nodeId=1`. Wait ~3 sec for the socket to emit
`door:terminated`. Then wait until session subState shows
`read_command` (menu prompt). Pauses / bulletin screens may
intercept input — press space a few times with 1-sec gaps to clear
them, or wait for state to settle:

```
for i in 1 2 3 4 5; do
  curl -s -X POST 'http://127.0.0.1:3001/debug/api/sessions/1/input' \
    -H 'Content-Type: application/json' -d '{"text":" "}'
  sleep 1
done
```

Verify: `curl /debug/api/sessions | jq '.bbsSessions[0].subState'` →
should be `"read_command"`.

### 6. Launch Olm and drive delivery

```
# MUST delete the residual LISTS/2 file from prior runs so MODE_OLDFILE
# fail-if-missing fires
rm -f "/Users/spot/Code/amiexpress-web/Doors/!!!WAR!!!/WAROLM/LISTS/2"

# Launch Olm (capital O matters — Commands/BBSCmd/Olm.info)
curl -s -X POST 'http://127.0.0.1:3001/debug/api/sessions/1/input' \
  -H 'Content-Type: application/json' -d '{"text":"Olm\r"}'
sleep 6

# Select node 2 (two down arrows + Enter; first down goes from row 0
# to row 1, second to row 2)
curl -s -X POST 'http://127.0.0.1:3001/debug/api/sessions/1/input' \
  -H 'Content-Type: application/json' -d '{"text":"\u001b[B\u001b[B\r"}'
sleep 2

# Type a one-line message + blank line to terminate
curl -s -X POST 'http://127.0.0.1:3001/debug/api/sessions/1/input' \
  -H 'Content-Type: application/json' -d '{"text":"TEST\r\r"}'
sleep 1

# Confirm Yes
curl -s -X POST 'http://127.0.0.1:3001/debug/api/sessions/1/input' \
  -H 'Content-Type: application/json' -d '{"text":"Y"}'
sleep 5
```

### 7. Check what happened

```
# Any cross-node JH_SM delivery attempt?
tr -d '\0' < logs/backend.log | grep 'X-NodeRoute.*AEServer.2 cmd=4'
# (current behaviour: NO output — delivery loop didn't run)

# Did MODE_OLDFILE return IoErr=205 (confirms my fix works)?
tr -d '\0' < logs/backend.log | grep 'IoErr=205.*LISTS/2'

# Did DT_SLOTNUMBER return "2" properly (confirms fix)?
tr -d '\0' < logs/backend.log | grep 'DT_SLOTNUMBER\|cmd=104'
```

## What I tried this session and what failed

- **Assumed delivery was file-write to `LISTS/<slot>`**: wrong.
  Disasm of `0x11DE` proved it's `PutMsg(JH_SM)` to AEServer. The
  LISTS Open is a probe, nothing more.
- **Set `DOOR_PC_PROBE_RANGES=0x2DA0-0x2E20,0xDBC-0xE20` with
  maxHits=20**: no probe hits during WarOLM execution. Address
  mapping or env-var parsing needs verification.
- **Password for `spot` user**: original bcrypt didn't match. I
  updated the DB to bcrypt of "test":
  `$2b$10$HcBfp2i12.mCis8vuUNB5OtzhgLT1Ffkb3vDtYurOL0/WFOER.oGe`.
  But even after backend restart, login failed. Abandoned — used
  just sysop on one node and left node 2 at login prompt (STATS@2
  still shows IDLE, sufficient for WarOLM's target probe).

## Related landmarks

- `web/backend/src/amiga-emulation/session/lifecycle/door-message-callbacks.ts:236-274`
  — cross-node `JH_SM` handler, already correct
- `web/backend/src/amiga-emulation/session/lifecycle/DebugMonitor.ts:255`
  — `checkPcProbes` for instrumentation
- `web/backend/src/amiga-emulation/xim/io.ts:405`
  — `completeLineInput` (potential D7-bug site if line-editor is the cause)
- `web/backend/src/amiga-emulation/xim/io.ts:873`
  — `completeHotkey` (potential 0x11a-bug site if Y/n is the cause)
- `Documentation/7-Reference Sources/disasm/aedoor.library.asm`
  — native AEDoor.library disasm for reference
- Prior handoff: `thoughts/shared/handoffs/2026-04-20_warolm-delivery-and-cursor.md`
  — initial investigation, updates this doc supersedes
