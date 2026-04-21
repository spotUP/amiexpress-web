---
date: 2026-04-21
topic: warolm-cosmetic-investigation
tags: [68k, warolm, olm, cosmetic, info-editor, newline-semantics]
status: investigated-not-shipped
---

# WarOLM cosmetic investigation — overnight session

After the JH_SHUTDOWN cooperative-signal fix shipped (`3a4c30a3d`),
picked up the two cosmetic WarOLM items from the carried-forward list.
Both proved harder than expected and are **not** shipped. Tree is
clean on these; Config.info reverted, `xim/io.ts` and
`DebugMonitor.ts` identical to HEAD.

## Task A — Row 00 phantom in Olm table

**Symptom** (pre-investigation): WarOLM user-list shows an empty row
`| 00 |` above the real nodes 01-03.

**Root cause**: `Doors/!!!War!!!/WarOLM/Config.info` lacks a `LOWNODE`
tooltype. Per `WarOLM.Guide`: "LOWNODE=xx ... it will default to 0 if
it is not set." Config.info at HEAD has only `HIGHNODE=3` and
`ASK_BEFORE_SENDING=YES`.

**Attempted fix**: run
`npx tsx web/backend/src/scripts/info-editor.ts
Doors/!!!War!!!/WarOLM/Config.info set LOWNODE 1`.

**What went wrong**:
- Before edit: 1027 bytes, legit DiskObject with tooltype array at
  file offset ~0x3c2. Length-prefixed entries:
  `0000 000b 48494748...` = `(11) HIGHNODE=3\0`, then
  `0000 0017 41534b5f...` = `(23) ASK_BEFORE_SENDING=YES\0`, then
  a `FORM`/`ICONFACE` NewIcons secondary-icon structure starting
  at 0x3e9.
- After edit: 467 bytes. Icon image data from 0x00-0x3bf (the bulk
  of the file) was truncated. LOWNODE=1 was appended as a raw
  tooltype AFTER the `FORM`/`ICONFACE` structure, without
  length-prefixing it as part of the array.
- WarOLM then read a structurally-invalid file and displayed rows
  02-04 instead of 01-03 — clearly a wrong parse, likely reading
  LOWNODE as 2 due to misalignment.

**Root cause of the editor bug**: `info-editor.ts` scans the .info
file as a flat byte stream looking for uppercase `KEY=VALUE` patterns
(same heuristic as `IconLibrary.parseInfoFile` in
`web/backend/src/amiga-emulation/api/IconLibrary.ts:919`). It doesn't
parse the DiskObject structure. When `set` is called it appends the
new tooltype to the scanned list and rewrites the file, losing the
original gadget/image/secondary-icon data.

**Pointer to the real editor**:
`web/backend/src/scripts/info-editor.ts` has commands
`{list,get,set,delete,enable,disable,toggle,backup,restore}` but the
implementation is structurally naive.

**Next-session plan**:
1. Read the HEAD Config.info bytes 0x3b0-0x3ff as reference (the
   tooltype array format is clear — length-prefixed strings inside
   the DiskObject).
2. Either:
   - Rewrite `info-editor.ts` to properly parse the DiskObject
     (magic `e3 10`, gadget header, image data, then tooltype
     array), OR
   - Use `amitools`'s `diskobject.py` (already in
     `dev/docs/amitools/amitools/vamos/libstructs/` in the repo),
     OR
   - Use vamos to run the real Amiga `IconEdit` / `GetDiskObject` +
     `PutDiskObject` round-trip.
3. Insert `LOWNODE=1` as a new length-prefixed entry between the
   existing `ASK_BEFORE_SENDING=YES` entry and the start of the
   `FORM`/`ICONFACE` secondary structure. Update the DiskObject's
   tooltype pointer chain if needed.

Config.info is reverted to HEAD. No on-disk change shipped.

## Task B — WarOLM editor cursor `ESC[11A` offset

**Symptom** (pre-investigation): After typing in WarOLM's line
editor, the " 1>", " 2>" line-number prompts appear below the bottom
border instead of inside the 10-row edit box.

**Trace via XIM** — WarOLM's draw sequence for the edit box:

```
msg 22: "   [=72x=]\n\n\n\n\n\n\n\n\n\n"   // top border + 10 LFs
msg 23: "   [=72x=]\u001b[37m\u001b[11A"   // bottom border + cursor-up 11
msg 24: "\u001b[33m 1\u001b[37m>"          // " 1>" prompt
```

Intent on real Amiga (where `\n` is LF-only, column unchanged):
1. After msg 22: cursor is 10 rows below top border, col 77
   (end-of-`]`, no CR).
2. msg 23 draws bottom border starting at col 77, wrapping to next
   row — that's the intended visual: bottom border at row T+10
   stretching cleanly because col-reset isn't happening.
   Actually simpler — WarOLM probably expects col-reset either way.
   Point is: `[11A` moves cursor up 11 rows from bottom-border row
   to land just above top border, then the subsequent " 1>" is
   intended to land at first edit row.

**What happens in our emulator** (confirmed via in-line
`[XIM-CURSOR-DBG]` log in `emitText`, now reverted):
- `xim/io.ts:1548` normalizes `\r\n` → `\n` (fine) but then the
  per-segment loop at line 1587 adds `\r\n` as suffix to every
  segment. `handleSendMessage` also auto-appends a trailing `\n`
  when `msg.data=1` (line 1556-1558) to match express.e's
  `aePuts('\b\n')` — we drop the `\b`.
- Net: `directEmit` receives
  `"   [...]\x1b[37m\x1b[11A\r\n"` — the cursor-up is correct
  but followed by an injected `\r\n`.
- Terminal: `[11A` moves up 11, then `\r\n` moves cursor to col 0
  on the next row. Result: cursor lands ONE row below where
  WarOLM expected, and " 1>" shifts.

**Why not fixed**:
- Correct fix: preserve bare `\n` as LF-only throughout emitText,
  relying on xterm.js `convertEol: false` (already set in
  `packages/terminal/src/components/BBSTerminal.tsx:444`) for
  Amiga-style behavior, while still emitting `\r\n` where code
  explicitly sends CRLF.
- Blast radius: every 68K door that emits `\n` via JH_SM today
  would change rendering behavior. Doors that emit bare `\n`
  expecting CRLF (because current BBS adds the `\r`) would
  suddenly render differently. Needs a full test matrix across
  working doors.
- Not appropriate to ship blind overnight.

**Instrumentation artifact** (reverted, for reference):

```typescript
// web/backend/src/amiga-emulation/xim/io.ts around line 1590
if (output.includes('\x1b[11A') || output.includes('\x1b[10A')) {
  console.log(`[XIM-CURSOR-DBG] directEmit with cursor-up: ${JSON.stringify(output)}`);
}
```

Produced log line confirming directEmit emission:
`[XIM-CURSOR-DBG] directEmit with cursor-up: "   [\u001b[32m====[34m]\u001b[37m\u001b[11A\r\n"`

**Next-session plan**:
1. Read `packages/terminal/src/components/BBSTerminal.tsx:438-449`
   and confirm `convertEol: false`.
2. Change `xim/io.ts:1587` suffix from `\r\n` to `\n` — test
   against WHO, RTW, Bulls, MultiTop, QuickNew, dRE!WAll, AquaScan
   at minimum. Watch for layout regressions.
3. Also consider: `handleSendMessage` should emit `\b\n` literally
   (per express.e) instead of dropping `\b`; this changes column
   after the msg.data=1 auto-newline.
4. If regressions surface: narrow the change to only strip the
   auto-\n on messages that end in a cursor-positioning escape
   sequence (`ESC[*[A-HJKSTf]`), as a heuristic.

## Files touched (and reverted)

- `web/backend/src/amiga-emulation/xim/io.ts` — added and removed
  `[XIM-CURSOR-DBG]` log.
- `web/backend/src/amiga-emulation/session/lifecycle/DebugMonitor.ts`
  — added D6/D7/sp+0x11a probe fields, then reverted.
- `Doors/!!!War!!!/WarOLM/Config.info` — set LOWNODE=1, then
  reverted via `git checkout` after confirming corruption.

All three match HEAD as of handoff writing. `git diff -- <file>`
returns zero lines for each.
