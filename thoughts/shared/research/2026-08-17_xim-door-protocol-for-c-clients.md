---
date: 2026-08-17
topic: AmiExpress XIM door wire protocol - exact reference for writing doors in C
tags: [research, xim, aedoorport, protocol, 68k, c]
status: final
---

# AmiExpress XIM door protocol — reference for C doors

Extracted from primary sources: the vendored original E sources
(`Documentation/7-Reference Sources/AmiExpress-Sources/axcommon.e`,
`express.e`), our emulator implementation (what a door actually talks to when
run under amiexpress-web), and real door sources in
`/Users/spot/Code/amiexpress_doors`. Authority order: E sources > emulator TS >
real doors. Divergences are in the last section and matter.

## Port, handshake, node number

- `TYPE=XIM` in the command's `.info` selects this protocol
  (`amiga-command-parser.util.ts:545`; default is `SIM`, `express.e:4676`).
- **The BBS creates** the public port `AEDoorPort<node>` (`express.e:4317,4327`).
  Our emulator pre-creates it before the door's first instruction
  (`DoorLifecycleManager.ts:469-472` -> `ExecLibrary.createAEDoorPort()`,
  `ExecLibrary.ts:5073`), with `sigBit` hardcoded to 12.
- **The door creates** its own reply port; anonymous is fine, the BBS never
  reads its name.
- **Node number arrives as `argv[1]`** only (`express.e:4308`;
  `DoorLoader.ts:389-443` writes exactly one argument). For XIM doors the
  configured args are deliberately dropped — runtime params come over the
  message channel via `BB_MAINLINE`.

Startup sequence (hard invariant — the BBS sends nothing first and blocks in
`Wait(ximSig)` at `express.e:4354`):

1. `sprintf(name, "AEDoorPort%d", atoi(argv[1]))`, `FindPort(name)`.
   NULL means "not running under AmiExpress" — exit.
2. Create a reply port. Allocate the message `MEMF_PUBLIC | MEMF_CLEAR`.
3. Fill `mn_Node.ln_Type = NT_MESSAGE`, `mn_Length = sizeof(struct JHMessage)`,
   `mn_ReplyPort = <your port>`, `NodeID = -1`.
4. `Command = JH_REGISTER (1)`, `PutMsg`, wait on your port, `GetMsg`.
5. Work. Then `Command = JH_SHUTDOWN (2)`, `PutMsg`, wait for the reply,
   delete port, free message, exit. **Never exit without JH_SHUTDOWN** or the
   BBS waits forever (`AEDoor.c:147-148`); it decrements the active-door count
   and at zero the BBS leaves its door loop (`express.e:3388-3394`).

`JH_REGISTER` is conventionally first but is not enforced as a gate.

## Message structure — allocate the FULL 264 bytes

Canonical: `axcommon.e:543-556`. Offsets independently confirmed by
`amiexpress_doors/Sources/_C/AMIXDOOR/AmiX.h:47-57` (offsets in comments),
`ximdoor.s:16-24`, and our `DoorTypes.ts:86-113`.

```c
/* big-endian m68k, no padding; struct Message is 20 bytes,
   every scalar is a naturally-aligned 32-bit value */
struct JHMessage {
    struct Message  Msg;         /* 0x00  20 bytes                        */
    char            String[200]; /* 0x14  data buffer, NUL-terminated     */
    LONG            Data;        /* 0xDC  direction flag / length / result */
    LONG            Command;     /* 0xE0  command code, and some results   */
    LONG            NodeID;      /* 0xE4  node/slot; set -1 at register    */
    LONG            LineNum;     /* 0xE8  line counter                     */
    ULONG           signal;      /* 0xEC  door's extra signal (JH_ExtHK)   */
    struct Process *task;        /* 0xF0  BB_GETTASK result                */
    APTR            Semi;        /* 0xF4  MULTICOM result                  */
    APTR            Filler1;     /* 0xF8  generic pointer argument         */
    APTR            Filler2;     /* 0xFC  generic pointer argument         */
    char           *strptr;      /* 0x100 JH_SMPTR source pointer          */
    LONG            Filler3;     /* 0x104                                  */
};                               /* SIZEOF = 0x108 = 264 bytes             */
```

**Do not stop the struct at `Semi` (248 bytes).** `NodeID` (0xE4) and
`LineNum` (0xE8) are written by the BBS with NO `mn_Length` guard
(`xim/messages.ts:279-291`, invoked from `XIMProtocol.ts:625-632`), so a short
allocation gets written past. The optional tail fields ARE length-gated
(`express.e:3919,4072,4552,4575`; `messages.ts:66-107`), so setting
`mn_Length` correctly is what makes `strptr`/`Filler*` usable at all.

Exec sub-offsets both sides use directly: `ln_Type` = 0x08,
`mn_ReplyPort` = 0x0E, `mn_Length` = 0x12 (UWORD).

Usable string payload is **198 characters** plus NUL, not 200 — native
`aedoor.library` and our emulator both cap there (`DoorTypes.ts:93-95`;
`aedoor.library.asm:293-296`). Chunk longer output at 198.

## Commands a browsing/downloading door needs

| # | Name | Semantics |
|---|---|---|
| 1 | `JH_REGISTER` | First message; increments the node's door count. |
| 2 | `JH_SHUTDOWN` | Last message; decrements it. Mandatory. |
| 4 | `JH_SM` | **The normal output call.** Writes `String`; if `Data != 0` the BBS appends the line break and runs its pause check (`express.e:3406-3411`). |
| 3 | `JH_WRITE` | Write with no newline, no pause handling. |
| 6 | `JH_HK` | Prompt from `String`, then blocking single-key read. Reply: key in `String[0]`, `String[1]=0`; `Data = 1` ok, `-1` carrier loss or timeout. |
| 5 | `JH_PM` | Prompt from `String` + line input. `Data` = max response length. Reply text in `String`; `Data = 1` / `-1`. |
| 0 | `JH_LI` | Line input where `String` is a PRE-FILLED default (no prompt). `Data` = max length. |
| 17 | `JH_FetchKey` | Non-blocking: key in `Command`, or `Command = 0` if nothing pending. |
| 131 | `BB_MAINLINE` | Returns `"<command> <params>"` in `String` — the canonical way to read your own command line. |
| 100+ | `DT_*` | User info. `Data != 0` = READ (BBS fills `String`), `Data == 0` = WRITE. Numeric values travel as decimal ASCII in `String`, never as binary in `Data`. |
| 122 | `DT_LINELENGTH` | Real screen height, if you need one (see the register-reply divergence below). |
| 136 | `RETURNCOMMAND` | `String` becomes a BBS command executed after the door exits. |

Full numeric list: `axcommon.e:72-364` (`JH_LI=0` … `MAX_CMD=1003`); C copies
in `AEKIT101/AE.Includes/DoorHeader.h:10-142` and
`amiexpress_doors/Sources/_C/WOT-AD22/SAS_C/Include/libraries/aedoor.h:65-172`.

**`Data == -1` on any input call means carrier loss or console timeout.** Treat
it as "user is gone": stop, send `JH_SHUTDOWN`, exit.

## Reply convention

The BBS mutates the message **in place** and calls `ReplyMsg` — there is no
separate response struct. Results land in `String`, `Data`, `Command`, or a
pointer field depending on the command. The door waits on its own reply port
(`WaitPort` or `Wait(1 << mp_SigBit)`, both attested) then `GetMsg`s.
Strictly one outstanding message at a time. Real doors keep one statically
allocated message and reuse it for every call.

## Strings and line endings

NUL-terminated, never length-prefixed. Amiga charset is ISO-8859-1/topaz.

Preferred for new code: send text with **no** terminator and set `Data = 1`,
letting the BBS emit the break (`express.e:3410`). Embedding your own `\r\n`
also works and is common, but never do both — `Data = 1` plus a trailing
newline risks a doubled break.

## Divergences and traps (emulator vs original, all deliberate)

1. **`JH_REGISTER` reply is not a screen height here.** `express.e:3380`
   returns `userLineLen`; our emulator returns `9999` in both `Command` and
   `Data` (`system-commands.ts:127-215`). Use `DT_LINELENGTH` if you need the
   real value.
2. **Do not build pagination on `LineNum`.** The original zeroes it per
   message (`express.e:4365`); our emulator only zeroes it on register, so an
   AEKIT-style counter accumulates.
3. **`ximPort` is always 2 (serial)** — no local console
   (`io.ts:1466-1470`). Console-vs-serial branches always take serial.
4. **Never start an output line with `bbs:`** — `JH_SM` silently reroutes such
   strings to file display instead of printing them (`io.ts:661-667`). Relevant
   for a door that prints paths.
5. Always pass a sane `Data` to `JH_LI`: `Data >= 65536` or `Data == 0` with an
   empty string auto-replies empty (`io.ts:328-340`).
6. `EXPRESS_VERSION (152)` returns the BBS version string, matching
   `express.e:3808-3810`. `Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md`
   claims it should return the command line — that document is STALE on this
   point (and on `AEDoorPort` ownership). Use `BB_MAINLINE`.
7. Avoid naming a new door `RTW` — `io.ts:786-804` has door-name-keyed hacks.
8. Fields past `Filler3` have no names in `axcommon.e`; the emulator sizes its
   own messages at 0x150 for doors that touch up to 0x14a. Don't use them.

## Best reference sources to read before writing a door

1. `amiexpress_doors/Sources/_AREXX/DC-X107I/.../SASC/Example2.c` — ~87-line
   complete minimal XIM door (find port, register, one generic
   `XIMFunction(func,data,str)`, shutdown).
2. `Documentation/7-Reference Sources/AEKIT101/AE.Includes/AmiConSASc.c` —
   855-line official glue: `Register` (62-126), `ShutDown` (128-137),
   `sendmessage` with chunking and auto-pause (159-182), `hotkey` (346-356),
   `prompt` (438-450), `lineinput` (463-475).
3. `AEKIT101/Docs/DoorDocs.txt` — 964-line per-command field spec.
4. `amiexpress_doors/Sources/_C/AE_DOORS/AEDoor.c` + `doordocs.txt` — the
   canonical glue our own reference door adopts.
5. `amiexpress_doors/Sources/_C/AMIXDOOR/AmiX.h` — struct with explicit
   decimal byte offsets; best single citation for offsets.

Alternative to hand-rolling: `aedoor.library` is fully trapped in our
emulator (all 20 LVOs — `api/library-vectors/aedoor-vectors.ts`), but it sets
`mn_Length = 0x100`, below `SIZEOF jhMessage`, so `strptr` is unavailable on
that path.
