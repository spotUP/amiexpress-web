---
date: 2026-08-14
topic: FAME (FIM) + DayDream (DD) door compatibility layers — research
tags: [amiga-emulation, fame, daydream, dreamdoor, door-protocols, research]
status: final
---

# FAME / DayDream door compatibility — research

Goal: unlock the FAME BBS (FIM) and DayDream BBS door corpora from
`/Users/spot/Code/amiexpress_doors/Archives` on the AmiExpress-Web emulator.
Two parallel sweeps: in-repo state + reference-source mining.

## Corpus reality check (revises the "~380 doors" estimate)

- Archives: AmiExpress 3413 files, **FAME 131**, **DayDream 91**, S!X 31, CNet 2.
- FAME: **75 of 95 LHA archives contain `FAMEDoorPort`** → native FIM doors.
  48 `.fim` executables counted. 36 `.LZX` not yet content-scanned (LZX can't
  stream; needs extraction).
- DayDream: only **~13 native doors** (3 archives use `DD_DoorPort` raw,
  10 use `dreamdoor.library`, 5 use `DDCommand`); the rest of the 84 LHAs is
  art/docs/config. 32 `.dd` executables.
- `.AIM` is AmiExpress ARexx, NOT FAME — don't conflate.
- **FAME is ~10x the door count of DayDream.** Prioritize FAME.

## In-repo state

### DayDream: partial layer exists but is DEAD CODE

`web/backend/src/amiga-emulation/api/DreamDoorLibrary.ts` (414 lines, untouched
since 2026-01-30):

- Implemented: InitDoor (-6), InquirePointers (-12), SendString (-24),
  CloseDoor (-48). Partial: Prompt (-18, emits but never reads input, always
  returns 1). Stubs (log-only): GetKey, DisplayFile, DDCommand,
  JoinConference, XprSend, ScanFileDirs, Disconnect.
- **Never activated**: `installDreamDoorVectors()` (LibraryTraps.ts:1172-1203)
  is never called. The `setLibraryOpenedCallback` chain
  (LibraryManager.ts:715-793) has no `dreamdoor.library` branch. OpenLibrary
  succeeds (ExecLibrary.ts:1160-1166 → 0x0f8000) but `fillStubJumpTable`
  writes RTS over all slots → every DD call returns garbage D0 → Guru.
- **Bug**: `DREAMDOOR_BASE = 0xE0000` (DreamDoorLibrary.ts:87) collides with
  `INTUITION_LIB_ADDR = 0x0e0000` (ExecLibrary.ts:193). Must move to the exec
  allocator (starts 0x100000).
- Missing: `syncTrapAddressesToMoira()` call after vector install (bsdsocket/
  amissl do it; DD doesn't).

### FAME: zero support. No stub, no enum value, no port name anywhere.

### Plug-in points for any new 68K door protocol

A. Library side: ExecLibrary.ts:190-201 (base addr), :1160-1166 (name case —
   beware `stubJumpTableEntries` RTS-fills the LVO range; install real vectors
   after), new `api/library-vectors/<name>-vectors.ts`, new `api/<Name>Library.ts`,
   LibraryTraps setter+installer (+ syncTrapAddressesToMoira), LibraryManager
   :649/:688 construct+inject, **:715-793 open-callback branch (the wire DD
   is missing)**.
B. Door type routing: amiga-command-parser.util.ts:17-31 + :453-471 (enum +
   aliases), node-logs.util.ts:14-23 (log code), door.handler.ts:1517-1521
   (executor switch), :3872-3875 (68K category list), door-installer.ts:164 +
   206-227 (TYPE= sniffing — currently hardcodes XIM).
C. Session/port wiring: LibraryManager.ts:375 (port name selection),
   AmigaDoorSession.ts:675-684 (pre-start port creation),
   :555-566 (protocol handler registration), LibraryManager.ts:489
   (useXimProtocol gate — FAME/DD should NOT get XIMProtocol),
   AmigaDoorSession.ts:935/974-981 (pr_CLI decision).
D. Detection tooling: `dev/scripts/analyze-all-doors.sh:38-63` is where
   AEDoorPort/DoorControl sniffing lives; add FAMEDoorPort / DD_DoorPort /
   dreamdoor.library branches. (The 2026-05-26 Archives scan script was
   ad-hoc, not committed; corpus tooling defaults door_type XIM —
   build-door-catalog.ts:726.)

## FAME "FIM" protocol (fully documented — dev kit present)

Primary refs (all under `/Users/spot/Code/amiexpress_doors/Sources/_C/`):
- `FA_DE103/Includes/FAME/FAMEDoorCommands.h` — 412 command #defines w/ per-
  command Data1/2/3+IOString in/out docs. THE spec.
- `FA_DE103/Includes/FAME/FAMEPublicStructs.h` — `struct FAMEDoorMsg` layout.
- `FA_DE103/FAME/FAMEDoor/FAMEDoorStartUp/FAMEDoorStartUp.c` — reference
  client: FIMStart/FIMHandlePort/FIMEnd (whole handshake).
- `FA_DE103/FAME/FAMEDoor/TestDoor.c` — skeleton door (+ TestDoor.FIM binary).
- `FAMECFPR/Pre-Release/include/fd/FAME_lib.fd` — FAME.library 6.0 LVOs.
- Working door sources + binaries for A/B: FAMEWH12 (FAMEWHO.c/.FIM),
  FAMEDC11, FAMEMH16.
- `Archives/FAME/COR-FD13.LHA` — AmigaE `famedoor.library` kit (second client
  library; .fd bias 30: PortStart/PortEnd/GetCommand/PutCommand/GetString/
  GetKey/PutString/GetFameDoorMsg).

Handshake: BBS launches door as CLI prog with `NODENR/N/A`; door
OpenLibrary("FAME.library",0); allocates msg via
`FAMEAllocObject(FOBJ_PS_FAMEDoorMsg=1)`; builds port name
`"FAMEDoorPort%ld"` (char[30]); per command: Forbid/FindPort/PutMsg/Permit,
Wait on reply port, read fdom_ReturnCode. One reused message, strictly
synchronous, FindPort every command. Start=MC_DoorStart(1),
exit=MC_ShutDown(2)/MC_ShutDownLastWords(3).

`struct FAMEDoorMsg` (282 bytes): Message(20) + IOString[202]@20 +
StringPtr@222 + Command@226 + Data1@230 + Data2@234 + Data3@238 +
ReturnCode@242 + Node@246 + InternalBits@250 + StructDummy1-3@254/258/262 +
StringPtr2@266 + Data4@270 + BitFlags@274 + ExternalPort@278.
Convention: inputs Data1→Data2→Data3; returns in Data2 (ULONGs Data3).

Return codes: 0 OK, 1 fail, 2 no-such-cmd, 3 denied, 4 not-impl, 5 aborted,
10 user error, -1 door-abort-requested.

Command ranges: MC 1-9 (lifecycle), NR 10-199 (retrieve/send), NC 200-399
(change), CF 400-599 (BBS functions: CF_ShowText 400, CF_ZModemSend/Receive
405/406, CF_ReturnCommand 408, CF_CallersLog 411, CF_SysOpChat 426), SR
600-699 (SR_ConfName 600, SR_ConfNum 602, SR_NodeNumber 614), SC 700-799,
AR 800-899 (AR_GetKey 800, AR_HotKey 861), AC 900-999, RD 1000+ (private).
Key NR codes: SendStr 10, SendStrCRLF 11, PromptChars 14 (modes: 0 plain,
1 chat-wrap, 2 msgedit=DENIED, 3 bulletin w/ cursor keys in Data3, 4 password),
HotKey 15, BBSName 16, SysOp 17, MainLine 23, Name 31, Password 32,
Location 33, AccessLevel 37, TimeRemain 48, Uploads/Downloads 51/52,
BytesUp/Down 53/54, GetFullArg 87, GetArgument1-4 88-91, GetAbortIOPort 111.

FAME's own DOORTYPE table: 0=FIM 1=XIM 2=TIM 3=AIM 4=CIM 5=RIM 6=SIM 7=TXT
8=SND 9=SPK 10=GFM — FAME itself runs XIM doors, so parity is one-way.

Implementation shape for us: implement the FAMEDoorPort message server (like
XIMProtocol) + a minimal FAME.library (FAMEAllocObject/FreeObject/StrCopy...
per FAME_lib.fd) + famedoor.library for E doors. ~100 lib LVOs but most doors
touch a handful.

## DayDream protocol (NOT documented — needs light RE)

Best refs (all `/Users/spot/Code/amiexpress_doors/Sources/_Assembly/`):
- `AEDD101/Xim.s` (15KB commented 68k, XIM→DayDream bridge; enumerates the
  whole usable DD API + struct field names). `DD-XIM/Xim.s` = v1.0.
- `AEDD101/AEKit.txt` + `DD-XIM/Xim.txt` — which /X features DayDream lacks
  (DT_TIMEUSED, BB_LOCAL, BB_CALLERSLOG, JH_EF... ready "not implemented" set).
- `Sources/_AREXX/DC-X107I/DC-SX107install/SX/SX` (91KB) — SX BBS 1.07,
  existing multi-protocol server: strings contain AEDoorPort%ld,
  DD_DoorPort%ld, FAMEDoorPort%ld. Authoritative server-side RE target.

Model: door opens `dreamdoor.library` v1; `InitDoor(A0=nodeText)` → handle;
`InquirePointers(A0=buf)` fills pointer block (dp_DayDream config,
dp_CurrUser, dp_CurrConf, dp_CurrentNode, dp_IODevice, dp_BpsRate,
dp_DoorCmd, dp_DoorParams) — SHARED MEMORY, not messages. LVOs used:
InitDoor, CloseDoor, InquirePointers, SendString(D0,A0),
Prompt(D0,A0=buf,D1=maxlen,D2=mode,D3=default)→D0 (0=carrier lost),
GetKey(D0,D1=0)→D0, DisplayFile(D0,D1=ansiFlag), ScanFileDirs(D0,D1=conf),
JoinConference(D0,D1,D2=0), XprSend(D0,A0=NUL-sep-list-$FF-term,A1),
Disconnect(D0), DDCommand(D0,A0=returnCmd).
User struct fields (widths load-bearing; times in MINUTES): HANDLE, PASSWORD,
ORGANIZATION, VOICEPHONE, ACCOUNT_ID(W), SECURITYLEVEL(B), BYTERATIO(B),
PUBMESSAGES(W), ULFILES(W), DLFILES(W), CONNECTIONS(W), LASTCALL(W),
DAILYTIMELIMIT(W), TIMEREMAINING(W), ULBYTES(L), DLBYTES(L), SCREENLENGTH(B).

### DayDream RE results (2026-08-15) — LVO table, wire format, struct offsets

**Method.** Disassembled with Moira's native disassembler via two small
harness scripts (not committed — `/private/tmp` scratch per RE-task
constraints): (1) `HunkLoader.parse()+load()` to relocate an arbitrary hunk
file to a chosen base and disassemble linearly (validated line-for-line
against `Xim.s`, see below); (2) a walker that locates the `RTF_AUTOINIT`
`Resident` structure (`0x4AFC` matchword) at the start of the library hunk
and reads its `InitTable{LibBaseSize, FunctionTable*, DataTable*,
InitLibFn*}`, then dumps `FunctionTable` (an array of absolute, relocated
function pointers, one per LVO slot spaced 6 bytes apart starting at -30,
terminated by `-1`) — this is exec's `MakeLibrary()` auto-init convention and
is what `DreamDoor.Library`/`dreamdoor.library` actually use (**not** a
static negative-offset JMP table baked into the hunk — that's why
`LibraryLoader.parseJumpTable()`'s fixed-offset `0x4EF9` scan finds zero
entries for this library today; see Part 2 fix below).

**Validation.** `xim` (2420B) was disassembled linearly from its hunk and
matched instruction-for-instruction against `Xim.s` (which is laid out in
strict source order by the assembler, so linear disassembly reproduces the
source line order exactly). Every `Jsr d16(A6)` call was checked against a
*known* AmigaOS Exec/Dos LVO constant where A6 held ExecBase/DosBase at the
call site — **18 independent matches, all exact**: AllocMem=-198,
FreeMem=-210, OpenLibrary=-552, CloseLibrary=-414, CreateMsgPort=-666,
DeleteMsgPort=-672, AddPort=-354, RemPort=-360, FindPort=-390, PutMsg=-366,
WaitPort=-384, GetMsg=-372, ReplyMsg=-378, Wait=-318, SystemTagList=-606
(dos), Open=-30 (dos), Read=-42 (dos), Close=-36 (dos). This is strong
independent confirmation that the relocation + addressing + disassembly
pipeline is correct, so the *dreamdoor.library*-specific LVOs recovered the
same way (below) are trustworthy. (Separately: `DCSXC100/Libs/AEDoor.library`
and the in-repo production `Libs/AEDoor.library` — whose LVO table
`aedoor-vectors.ts` already documents from production use — do **not** use
the plain-32-bit-pointer `FunctionTable` encoding; their table is an array of
16-bit words, i.e. a different compiler/toolchain's auto-init convention.
Decoding it wasn't needed — the 18-constant cross-check above is a stronger
validation than a second tool would have been — and is noted here only so a
future RE pass doesn't re-assume the DreamDoor convention applies uniformly.)

**LVO table** (`dreamdoor.library` v1.0, 29 Jan 95, confirmed via
`FunctionTable` walk of `DreamDoor.Library`; v6.0, 02 Feb 97, walked the same
way — **identical offsets and command codes for every v1.0 function**, v6.0
only appends -150 through -300, 26 new functions, protocol-compatible
superset). Names marked "(Xim.s)" are confirmed by both the `FunctionTable`
address *and* a matching `Jsr` in `xim`'s disassembly; others are inferred
from calling convention alone (`Xim.s` never calls them) — flagged as such.

| LVO | Name | Cmd | Args in (payload+2 unless noted) | Reply |
|---|---|---|---|---|
| -6/-12/-18/-24 | Open/Close/Expunge/ExtFunc | — | standard lib housekeeping (refcount, `Expunge` flag) | — |
| -30 | InitDoor (Xim.s) | — | A0=nodeText (C string) | D0=dif handle or 0 |
| -36 | CloseDoor (Xim.s) | 0 | — | full teardown, see Transport below |
| -42 | SendString (Xim.s) | 1 | +2(L)=A0 string ptr (by reference, NUL-term) | — |
| -48 | Prompt (Xim.s) | 2 | +2(L)=A0 buffer ptr (prompt text copied in, then answer copied back in place by BBS), +6(L)=packed `D1<<16\|D2` (D1=maxlen, D2=mode) | +0(W) status (0=carrier lost) |
| -54 | InquirePointers (Xim.s) | 3, then 0x12(18) | — (two round trips) | fills caller's 84-byte `Pointers` block, see below |
| -60 | DisplayFile (Xim.s) | 4 | +2(L)=A0 filename ptr, +0xa(L)=D1 (ANSI flag) | — |
| -66 | **JoinConference (inferred)** | 5 | +2(L)=D1 (conf number) | +0(W)!=0 ? long@+2 : -1 |
| -72 | UNKNOWN | 6 | +2(L)=A0 ptr, +6(L)=-1 (fixed) | word-gated: (W)@+0==2 ? long@+2 : -1 |
| -78 | UNKNOWN | 7 | +2/+6/+0xa(L) all 0 (no real args) | none read back — fire-and-forget |
| -84 | XprSend (Xim.s) | 9 | +2(L)=A0 (NUL-sep, `$FF`-term file list), +6(L)=1 (send), +0xe(L)=A1 (device/window override, often empty string) | +0(W) status |
| -90 | **XprReceive (inferred)** | 9 | same shape as -84 but +6(L)=0 (receive) and +2(L)=empty($FF-only) list | +0(W) status |
| -96 | UNKNOWN | 0xa | +2(L)=packed(D2 byte,D3 byte) — 2-byte param (cursor/color-like) | +0(W)result |
| -102 | UNKNOWN | 0xa | compound: does the -96 shape twice with more regs (D1-D6) — get+set pair | (W) |
| -108 | GetKey (Xim.s) | 0xb | +2(L)=D1 (v1: unused, always 0; v6: bit3 of D1 selects extended/word-sized key) | +2 byte (v1) or +4 word (v6, if D1 bit3 set) |
| -114 | ScanFileDirs (Xim.s) | 0xc | +2(L)=D1 (conf#), +6(L)=A0, +0xa(L)=A1, +0xe(L)=A2 (all 0 in Xim.s) | +0(W) |
| -120 | UNKNOWN | 0xd | +2(L)=A0, +6(L)=A1, +0xa(L)=D1, +0xe(L)=D2 | +0(W) |
| -126 | Disconnect (Xim.s) | 0xe | none | — |
| -132 | DDCommand (Xim.s) | 0xf | +2(L)=A0 (return-command string ptr) | — |
| -138 | UNKNOWN | 0x10 | none | none read back |
| -144 | UNKNOWN "close variant" | 0x11 | none | then runs the **identical** DeleteMsgPort/FreeMem×3 teardown as CloseDoor — likely an abort/forced-close path |

Only 11 of the 12 names the earlier research pass knew about (InitDoor,
CloseDoor, InquirePointers, SendString, Prompt, GetKey, DisplayFile,
ScanFileDirs, XprSend, Disconnect, DDCommand) were nailed down by name+offset
+cmd. **JoinConference** has no client call site in any available source, so
its LVO (-66) is a best-fit inference (single numeric arg matches
`JoinConference(D1=confNum)`), not a confirmed match — flag as
`INFERRED, not client-confirmed` in code comments if implemented.
-72/-78/-96/-102/-120/-138/-144 have no name in any available source; their
calling conventions above are directly disassembled and safe to stub as
"logged, ReturnCode=NOTIMPLEMENTED" (mirrors the FIM plan's unknown-command
policy) without blocking the ~13-door corpus, since no known door calls them.

**Wire format — `DreamDoorMsg`, 120 bytes (`0x78`), confirmed by direct
disassembly of every LVO handler body:**
- Bytes 0-19: standard Exec `Message` header — `ln_Succ`@0(4),
  `ln_Pred`@4(4), `ln_Type`@8(1)=`NT_MESSAGE`(5), `ln_Pri`@9(1)=0,
  `ln_Name`@10(4)=unused/0, `mn_ReplyPort`@14(4), `mn_Length`@18(2)=120.
- Byte 20 (`0x14`) onward: payload. `+0`(word) = command code on send,
  **reused in place** as result/status code on reply (same word, no separate
  return-code field). `+2` through `+0x11` (14 bytes): command-specific args
  per the table above. Strings/buffers are passed **by raw pointer**, never
  copied into the message — DreamDoor assumes door and BBS share one Amiga
  Exec address space (true for the real DreamDoor BBS; also true for us,
  since the door and the "BBS" server both run inside the same MOIRA
  process/address space in our emulator, so this convention needs no
  adaptation).

**Transport / port protocol** (differs from FAME's per-command
Forbid/FindPort/PutMsg/Permit — DreamDoor resolves the BBS port **once**,
at `InitDoor`, and reuses the pointer for the door's lifetime):
1. Door: `OpenLibrary("dreamdoor.library", 1)`.
2. Door: `InitDoor(A0=nodeText)` → D0 = 16-byte `dif` handle (0 on failure).
   Inside: `dif+0xc` = `AllocMem(1024, MEMF_PUBLIC|CLEAR)` scratch buffer;
   `RawDoFmt("DD_DoorPort%s", nodeText)` into it (confirmed literal format
   string, byte-for-byte, inside the library — matches `Xim.s`'s own
   `Portname` constant used for the *other* direction); `dif+0` =
   `FindPort(scratchBuf)` — **the BBS must already own and have registered
   this port before the door process starts**, or `InitDoor` fails and
   returns 0; `dif+4` = `CreateMsgPort()` (door's own private reply port);
   `dif+8` = `AllocMem(120, MEMF_PUBLIC|CLEAR)` (the `DreamDoorMsg`,
   `ln_Type`=NT_MESSAGE, `mn_Length`=120, `mn_ReplyPort`=`dif+4` — set once,
   reused for every subsequent command).
3. Every other LVO: write cmd+args into the *same* message, `PutMsg(dif+0,
   msg)`, `WaitPort(dif+4)`, `GetMsg(dif+4)` — a synchronous, blocking,
   single-message round trip (same semantics as FIM/XIM's exec message
   passing, standard `mn_ReplyPort` convention — the BBS side must
   `ReplyMsg()` it back, not free/reuse it out from under the door).
4. `CloseDoor(dif)`: send cmd=0, wait for reply, then
   `DeleteMsgPort(dif+4)`; `FreeMem(dif+0xc,1024)`; `FreeMem(dif+8,120)`;
   `FreeMem(dif,16)`.

**`Pointers` struct** (`dp_SIZEOF` = 84 bytes / `0x54`, filled by
`InquirePointers`'s two round trips — offsets are struct-relative, confirmed
by tracing the handler's writes into the caller's buffer and, where a name
exists, cross-matched against `Xim.s`'s own use of `Pointers+dp_X`):

| Offset | Field | Source |
|---|---|---|
| 0x00 | unknown pointer (1st InquirePointers reply field) | disasm only, no client use found |
| 0x0c | `dp_DayDream` (BBS config block; `CFG_SYSOPNAME` sub-field at +0x1a) | Xim.s + disasm |
| 0x1c | `dp_CurrConf` (`CONF_NUMBER`@0 byte, `CONF_NAME`@1) | Xim.s + disasm |
| 0x28 | `dp_CurrUser` (see USER_* table below) | Xim.s + disasm |
| 0x34 | `dp_DoorParams` — **present in the struct layout Xim.s expects, but NOT written by either InquirePointers reply batch in the v1.0 binary** (a real gap/quirk in the library, not an RE error — flag as "reads whatever was last in that memory" if reproduced faithfully, or just special-case it in our impl since we control both sides) | Xim.s (reads it); disasm shows it's never written |
| 0x38 | `dp_BpsRate` | Xim.s (`NODE_BAUDRATE` handler) + disasm |
| 0x3c | `dp_IODevice` (inferred position — sits between BpsRate and CurrentNode; no client read confirms it) | position only |
| 0x40 | `dp_CurrentNode` (node-id byte at sub-offset +0xe) | Xim.s (`BB_NODEID` handler) + disasm |
| 0x44/0x48/0x4c/0x50 | unconfirmed (3-4 more pointer slots from the 2nd reply batch — no client reads any of them; likely include `dp_DoorCmd` plus reserved) | disasm only |

**USER struct offsets** (confirmed via `Xim.s`'s `DT_*` handlers, all
relative to `dp_CurrUser`): `USER_HANDLE`=0x1a(26), `USER_PASSWORD`=0x78(120),
`USER_ORGANIZATION`=0x34(52), `USER_VOICEPHONE`=0x63(99),
`USER_SECURITYLEVEL`=0xeb(235,byte), `USER_BYTERATIO`=0xcf(207,byte),
`USER_PUBMESSAGES`=0xc8(200,word), `USER_ULFILES`=0xc4(196,word),
`USER_DLFILES`=0xc6(198,word), `USER_CONNECTIONS`=0xcc(204,word),
`USER_LASTCALL`=0xf2(242,word), `USER_DAILYTIMELIMIT`=0xfe(254,word,
minutes — write path divides by 60 from a seconds input; **the v1.0 binary's
own read-back path has a bug and re-reads `USER_ULFILES`'s offset 0xc4
instead of 0xfe** — a genuine quirk in the reference client, not ours to
reproduce), `USER_TIMEREMAINING`=0x102(258,word,minutes),
`USER_ULBYTES`=0xbc(188,long), `USER_DLBYTES`=0xc0(192,long),
`USER_SCREENLENGTH`=0x88(136,byte). `CONF_NUMBER`=0(byte), `CONF_NAME`=1.
`CFG_SYSOPNAME`=0x1a(26, relative to `dp_DayDream`).

**Nothing here is left genuinely unrecoverable statically.** The handful of
"unconfirmed" rows above (dp_+0x00, dp_+0x3c/0x44/0x48/0x4c/0x50, LVO -72/-78/
-96/-102/-120/-138/-144) have their exact wire-level calling convention from
direct disassembly; only their *semantic names* are unconfirmed because no
available client source calls them. A dynamic probe (running a real
DayDream-native door — e.g. `DC-SX107install/SX/SX` itself as a BBS-side
oracle, or any of the ~13 native `.dd`/`DDCommand` corpus doors under load in
a real Amiga emulator with I/O tracing) would name the rest, but nothing in
the FIM-equivalent MVP path below calls them, so this doesn't block
implementation.

RE artifacts (disassembly transcripts, throwaway harness scripts) were kept
under `/private/tmp/dd-re/` per the RE-task scratch constraint and are not
committed; `Archives/` and `Sources/` were never modified (read-only copies
were made into `/private/tmp` for hunk parsing).

**Confirmed wrong, per the 2026-08-15 RE pass above:** the existing
`DreamDoorLibrary.ts` LVO map (`-6 InitDoor ... -72 Disconnect`, plain
6-byte-spacing guesses) does not match the real library — real `InitDoor`
is -30, real `Disconnect` is -126, and the guessed map has the wrong function
at nearly every slot. `DreamDoorLibrary.ts:39-57`'s USER struct offsets also
need replacing with the confirmed table above (they lack
`ORGANIZATION`/`ACCOUNT_ID` naming entirely and don't match the real byte
offsets). See the implementation plan
(`thoughts/shared/plans/2026-08-15-daydream-dd-compat.md`) for the fix.

## Recommended plan of attack (next phase)

1. **FAME first** (75+ doors, zero RE needed, docs complete) — DONE, see
   `thoughts/shared/plans/2026-08-14-fame-fim-compat.md` (doorType `FIM`
   routing landed 2026-08-14/15, see `git log --oneline | grep fim`).
2. **DayDream second** (~13 doors) — RE done (this doc); implementation plan
   at `thoughts/shared/plans/2026-08-15-daydream-dd-compat.md`: replace the
   dead `DreamDoorLibrary.ts` LVO/struct maps with the confirmed table above,
   fix the `DREAMDOOR_BASE`/`INTUITION_LIB_ADDR` collision, wire the missing
   `dreamdoor.library` open-callback branch + `syncTrapAddressesToMoira()`,
   implement the find-once/reuse `DD_DoorPort<node>` transport (mirrors
   FIMProtocol's deferred-input pause/resume pattern for `Prompt`/`GetKey`),
   route doorType `DD`.
3. Extend `analyze-all-doors.sh` + door-installer detection with
   FAMEDoorPort/DD_DoorPort/dreamdoor.library sniffing (FAME side already
   done per the FIM plan's Task 8; DD side is new work in the DD plan).

Open questions: none blocking FAME (shipped) or DD (RE complete, plan
written) — see the DD plan's "Known risks / decisions" section for the small
number of deliberately-deferred items (the ~7 unnamed LVOs, the unconfirmed
`dp_+0x00`/`+0x44..0x50` fields), none of which gate the ~13-door corpus.
