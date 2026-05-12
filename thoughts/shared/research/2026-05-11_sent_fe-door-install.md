---
date: 2026-05-11
topic: sent_fe-door-install
tags: [doors, 68k, xim, empire, sent_fe]
status: final
---

# Sent_FE (EMPiRE / MYSTiC X-DESiGN) — install + first-run result

## Source
`/Users/spot/Code/amiexpress_doors/DOORS_TO_TRY/EMP-SF10.LHA`
- Binary: `EMP-SF10/BBS/DOORS/EmP_Tools/Sent_FE` (16856 B, Hunk 0x000003F3)
- Original .info: `EMP-SF10/BBS/COMMANDS/SYSCmd/Sent_FE.info` (TYPE=XIM, ACCESS=001, STACK=50000, PRIORITY=0, MULTINODE=YES)
- $VER: `Sent_FE 1.1 [/X DOOR] (01-29-94) - 1994 EMPiRE/MYSTiC`

## Install steps performed
1. `mkdir -p Doors/Sent_FE` and copied binary + `Sent_FE.DOC`.
2. Created `Doors/FileID/Sent.DAT` (door errors out if `DOORS:FileID/Sent.DAT` is missing).
3. Initially placed .info under `Commands/SysCmd/Sent_FE.info` — **did not work**: interactive menu input always dispatches with `allowSyscmd=FALSE` (`web/backend/src/handlers/command.handler.ts:4128`). SysCmd entries are not reachable from the user menu prompt; this matches express.e.
4. Moved .info to `Commands/BBSCmd/Sent_FE.info`, kept LOCATION=`Doors:Sent_FE/Sent_FE`.
5. `POST /api/doors/reload` → `Reloaded 120 door commands (was 119)`.

## First-run observation (sysop, Conf 2)
User typed `sent_fe` at menu. Output:

```
.------------------------------------------------------------------------------.
|                    Please Enter your Private Sentby-Line.                    |
|               Now you Never have to 'Sign' your Uploads again!               |
`------------------------------------------------------------------------------'

No such command!!  Use '?' for command list.
```

## XIM log: `logs/door-68k-Sent_FE-20260511080031.-N1.log`
Key flow:
- JH_REGISTER `AEDoorRP.010`
- SV_NEWMSG / DT_NAME / DT_SLOTNUMBER (`sysop`) / BB_NONSTOPTEXT
- Multiple `JH_SM` rendering the EMPiRE/MYSTiC banner box
- **`RX cmd=508 (PRV_COMMAND) data=0 str="Sent"`**
- A few empty JH_SM
- `JH_SHUTDOWN` (clean exit, status=ok, 2.19 s)

## Conclusion — door is working as designed
Sent_FE is a **wrapper / front-end stub**. Per `Sent_FE.DOC`:

> "Sent_FE should be started from a Bulletin … `~CC_FE_Sent` … Now EVERYBODY has to enter his Private SentBy-Line for use with FILE_ID.DIZ. When a valid SentBy-Line already exists then you don't get to see any output of this Door!"

It is meant to be triggered from a bulletin MCI, not the menu prompt. Its job:
1. Print the EMPiRE/MYSTiC banner.
2. Chain to a separate BBSCmd called **`Sent`** (XIM `PRV_COMMAND`).
3. Shut down.

The `Sent` command is shipped separately in the **5D-CS3** pack (`5D-CS3/Your_BBS/Doors/5D/Jdn-Csent.rexx`, BBSCmd type AIM, ACCESS=010). That AREXX does the actual menu / edit / convert / backup logic.

The "No such command" message is the BBS response to the chained `PRV_COMMAND "Sent"` — because we have not installed Jdn-Csent. It is **not** a user-input parser failure.

## Status
Sent_FE end-to-end install verified: banner renders, chain protocol matches design, clean shutdown. No fix needed on Sent_FE itself.

## Open follow-ups
- (Optional) Install `Jdn-Csent.rexx` as BBSCmd `Sent` (type AIM, AREXX). Caveat: the rexx uses `ADDRESS COMMAND "c:copy …" / "c:delete …"` for backup management. Per memory `feedback_arexx_door_picking.md`, ADDRESS COMMAND doesn't run here, so backup/restore submenu items will fail; core "edit sentby" flow may still work.
- Next 68K door from `DOORS_TO_TRY`: **5D-AutoFree** (SysCmd FILECHECK hook, marks uploads as FREE on filename match) — different code path (upload hook), worth testing.

## Files touched
- new `Doors/Sent_FE/Sent_FE`
- new `Doors/Sent_FE/Sent_FE.DOC`
- new `Doors/FileID/Sent.DAT` (empty)
- new `Commands/BBSCmd/Sent_FE.info`
