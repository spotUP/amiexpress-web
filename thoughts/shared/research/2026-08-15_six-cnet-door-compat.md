---
date: 2026-08-15
topic: "Sigma Express (S!X) and CNet BBS door compatibility with the AmiExpress-Web 68K emulator"
tags: [research, doors, 68k, xim, tim, sim, arexx, sigma-express, six, cnet]
status: final
---

# S!X + CNet door protocol feasibility

## Summary

**S!X requires no new protocol code.** Everything labeled "S!X" / "Sigma Express" in the
`amiexpress_doors` corpus is AmiExpress itself — the same door protocol suite (XIM/AEDoorPort,
TIM-SIM-IIM-SUP/DoorControl aka "PARADOOR", DD_DoorPort, FAMEDoorPort), the same
`AEDoor.library`, and (for the "S!X-Manual") literally the stock AmiExpress SysOp manual text.
Every door binary actually found in the 31-archive S!X census that isn't a bare CLI utility or a
demoscene cracktro/intro loader calls `AEDoor.library` (XIM). The existing XIM implementation
already covers them, and the existing TIM/SIM (`DoorControl{n}`) implementation covers the
"PARADOOR" door type the SX 1.07 server binary also exposes.

**CNet requires new (but modest) work.** Both CNet archives in the corpus are AREXX-only doors
using CNet's own AREXX host-command surface (`BBSIDENTIFY`, `GETUSER`/`GU` with CNet's own
numeric field-ID table, `LOADSCRATCH`/`GETSCRATCH`/`SAVESCRATCH`, `CHANGEWHERE`, `LOGENTRY`).
The repo's REXX engine and host-command dispatcher already exist and could host these, but none
of CNet's specific commands or field-ID semantics are implemented — and they are not
interchangeable with AmiExpress's `GETUSER` field IDs despite the coincidental name overlap.
With only 2 archives in the census, this is low payoff.

## S!X: what the archives actually contain

Extracted all 29 `.LHA` files in `/Users/spot/Code/amiexpress_doors/Archives/S!X` (31 total
archives; 2 are `.LZX` duplicates of `.LHA` files already present — `unlzx`/`lzx` unavailable,
not needed since LHA equivalents exist) with `/opt/homebrew/bin/lha xq` into scratch
(`/private/tmp/claude-501/.../scratchpad/six/`). A few archives had non-fatal path-name errors on
garbled scene-group directory names (high-bit / control-char dirnames); the payload files still
extracted.

Scanned every file with an AmigaDOS hunk header (`00 00 03 F3`) for latin-1 strings — 42 hunk
executables found. Classification:

| Category | Count | Examples |
|---|---|---|
| Genuine AmiExpress doors (`AEDoor.library`, XIM) | 11 | `OPS-DW11/DAWALL`, `OPS-DW12/DaWall`, `GNT-BUSY/BUSYTIME`, `OPS-BT11/BUSYTIME`, `OPS-BS11/BAUDSTAT`, `PST-QCK/Doors/pst/quick`, `AF-ST01/bbs/system/status`, `PST-SCAN/.../Scanner`, `PST-YSLF/.../YSister!LGF`, `SCX-EXE2/BBS/Doors/Scx-Executor/Scx-Executor.XIM`, `SAT-WAL1/Doors/SAT/satwall` |
| Demoscene cracktro/intro loaders (open only `intuition.library`, no door library at all — bundled release-group intros, not doors) | ~16 | `LGC-*/Relyscully.exe(.bak)`, `*/LE-window5.exe`, `*/eX-tRACT.exe`, `*/exe.-l0S-eND0S-bBS-.exe`, `AF-ST01/_negerku...exe`, `AF-ST01/pizza_taxi.exe`, `SAT-WAL1/sonnenbrand.exe`, `PST-YSLF/sonnenbrand.exe` |
| Standalone CLI/AREXX-adjacent utilities (dos.library only, no door port) | ~8 | `LGC-DM08/C/DIRmaker`, `LGC-PARA/Utils/{dmsdiz,exediz,txtdiz,parachange}`, `SCX-ULC2/C/messy`, `OPS-ET10/EasyTrade`, `S!X-QB/QUARTERBACKUP` (AREXX backup tool, opens `rexxsyslib.library`) |

Key evidence: `OPS-DW11/DAWALL`, `OPS-DW12/DaWall`, `OPS-BS11/BAUDSTAT`, `OPS-BT11/BUSYTIME`,
`GNT-BUSY/BUSYTIME` all contain the literal string `"This is an AmiExpress door!  Needs
AEDoor.library by SiNTAX/W..."`. `SAT-WAL1/Doors/SAT/satwall` contains `"This is a S!X door"`
immediately adjacent to `"AEDoor.library"` in the string table — i.e. the door's own self-ID
text calls itself an "S!X door" while depending on `AEDoor.library`, confirming "S!X" here names
the release/distribution branding, not a distinct binary protocol. `SCX-EXE2/BBS/Doors/
Scx-Executor/Scx-Executor.XIM` even carries the `.XIM` file extension and references
`AEDoor.library`/`dos.library` directly.

None of the 11 real doors reference `DD_DoorPort`, `FAMEDoorPort`, or any S!X/Sigma-specific
port name — all are plain XIM.

## The SX BBS server binary confirms the protocol landscape

`/Users/spot/Code/amiexpress_doors/Sources/_AREXX/DC-X107I/DC-SX107install/SX/SX` (91152 bytes,
SX BBS v1.07, per the embedded `$VER` strings) contains exactly four door-port format strings and
no others:

```
0x5d19  AEDoorPort%ld
0x5e00  "XIM: %ld  DATA: %ld"
0x62d4  DoorControl%ld
0x62f8  "PARA: %ld  DATA: %ld"
0x6d01  DD_DoorPort%ld
0x6d18  "DD: %ld  DATA1: %ld"
0x7372  FAMEDoorPort%ld
0x7394  "FAME: %ld  DATA1: %ld"
```

No `SXDoorPort`, `SigmaDoorPort`, `S!XDoorPort`, or any other native port name exists anywhere in
the binary. SX BBS is a multi-protocol door *launcher* that dispatches to whichever of the four
existing protocols a door was built for — it has no protocol of its own.

The `"PARA: %ld  DATA: %ld"` label next to `DoorControl%ld` is the giveaway: in
`AmiExpress-Sources/express.e:4285-4287`, the `DOORTYPE_TIM` case builds the exec string with
`StringF(exestring,'PARADOOR \s \d',cmd,node)` — "PARADOOR" is AmiExpress's own internal name for
the TIM door type, which (per `express.e:4316-4320`) opens a `DoorControl{n}` message port (as
opposed to XIM's `AEDoorPort{n}`). SX's "PARA" label over the `DoorControl%ld` port is that same
PARADOOR/TIM naming. Combined with the fact that
`_AREXX/S!X39N2/bbs-s!xbeta/S!X-DOCS_README.NOW/S!X-Manual` (308179 bytes, plain text) is
verbatim AmiExpress SysOp documentation — it discusses "AmiExpress", `AEDoorPort(n)` port naming,
the `PARADOOR` executable requirement for carrier-loss-safe doors, `AmiExpress_Node.x` AREXX
ports, and AmiExpress version-history changelog entries (v2.30, v2.34) — "Sigma Express (S!X)" in
this corpus is not an independently-designed BBS: it is AmiExpress (a fork/rebrand distributed
under the S!X/Sigma scene-group name), reusing AmiExpress's exact door protocol suite end to end.

## This codebase already implements the protocol S!X needs

`web/backend/src/doors/door-installer.ts:272-277` (`detectDoorType`) already classifies binaries
by exactly these port-name needles, in FAME-before-XIM-before-DoorControl order:

```
272 export function detectDoorType(buf: Buffer): string {
273   if (buf.includes(Buffer.from('FAMEDoorPort', 'latin1'))) return 'FIM';
274   if (buf.includes(Buffer.from('AEDoorPort', 'latin1'))) return 'XIM';
275   if (buf.includes(Buffer.from('DoorControl', 'latin1'))) return 'SIM';
276   return 'XIM';
277 }
```

`web/backend/src/amiga-emulation/DoorTypes.ts:144-183` defines the full TIM/SIM/IIM/SUP
`DoorControl{n}` protocol — `TIMDoorCommand` enum (`PG_SHUTDOWN`..`BB_TASKPRI`, 18 commands) and
`TIMDoorConstants` (the `doorMsg` structure: carrier/command/data/string[80], total 0x6c bytes),
explicitly cited against `express.e` lines 4371-4525 (the same PG_* SELECT block quoted above).

`web/backend/src/amiga-emulation/session/TIMDoorMessageHandler.ts` is a 641-line, fully wired
handler for this protocol (line input, hotkey, pause, PG_* command dispatch). It is not
scaffolding — `AmigaDoorSession.ts:568-584` initializes it whenever `effectiveDoorType` is
`TIM`/`SIM`/`IIM`/`SUP`, and `DoorLifecycleManager.ts:1653-1712` polls the `DoorControl{n}` port
by name (`` `DoorControl${nodeId}` ``) exactly as `express.e:4316-4320` names it.

`web/backend/src/utils/node-logs.util.ts:14-23` carries the full `DoorType` enum matching
`express.e`'s `axenums`: `XIM=0, SIM=1, AIM=2, TIM=3 (PARADOOR), IIM=4, MCI=5, AEM=6, SUP=7,
FIM=8` — i.e. every door type the SX binary's protocol menu could produce is already a named,
handled case in this codebase.

**Conclusion for S!X:** the door corpus census found zero doors needing anything beyond XIM (the
one real DoorControl/TIM/PARADOOR sample wasn't present as a binary in this archive set, but the
protocol is already implemented and tested against the same express.e source SX itself derives
its naming from). There is no S!X-specific engineering task — install/run the 11 identified doors
through the existing pipeline and treat any breakage as ordinary XIM/TIM door bugs, not a missing
protocol.

## CNet: AREXX-only, needs a new host-command surface

Extracted both CNet archives (`GCMENUS1.LHA`, `PORTSTAT.LHA`) — no hunk-executable binaries in
either. Both are pure AREXX + text-art packages:

- `PORTSTAT/PORTStatus.rexx` (v6.9b, "Star Streams BBS") — a real CNet door script. Opens with
  `options results;signal on SYNTAX;...;BBSIDENTIFY NAME;SYS=result;BBSIDENTIFY SYSOP;...`, then
  uses abbreviated host commands `se=sendstring; gc=getchar; qu=query; tr=transmit; gu=getuser`
  and numeric field-ID reads: `gu 23` (port), `gu 1` (handle), `gu 46` (today), `gu 57` (last-on),
  `gu 1500416`/`gu 1200536`/`gu 1200680` (system stats), plus `loadscratch`/`getscratch 15`/
  `savescratch`, `changewhere`, and REXX builtins `bittst`/`d2c`.
- `GCMENUS1/GC_Menus/GC_Main.rexx` (and sibling `GC_*.rexx` scripts) — same pattern:
  `tr=transmit; se=sendstring; gc=getchar; gu=getuser; gs=getscratch`, `GU 28` for terminal type,
  `Sendfile`, `bufferflush`, `logentry`, `errortext(rc)`.
- `PORTSTAT/sonnenbrand.exe` is the same 49988-byte cracktro/intro binary already seen bundled in
  two S!X archives (`SAT-WAL1/sonnenbrand.exe`, `PST-YSLF/sonnenbrand.exe`) — a release-group
  intro loader, not a door.

The repo already has a REXX engine and a host-command dispatch layer
(`web/backend/src/services/arexx/rexx-host-dispatch.ts:190` `registerHostCommand`,
`web/backend/src/services/arexx.service.ts`) — but it is scoped specifically to AmiExpress's own
AREXX door protocol per Aedoc4.guide §Cap1102. `arexx.service.ts:3283-3324` hard-codes the
`HOST_CMD_ALIASES` table (`GU`→`GETUSER`, `SS`→`SENDSTRING`, `TR`→`TRANSMIT`, `PM`→`PROMPT`,
etc.) whose `GETUSER` field IDs mirror AmiExpress's own `xim/types.ts` enum — a different
numbering scheme than CNet's (e.g. AmiExpress field IDs are small ints; CNet's script above reads
fields like `1500416`, `1200536`, `1311992`, `1100454` — CNet's own record-layout numbering).
`grep` for `BBSIDENTIFY`, `LOADSCRATCH`, `GETSCRATCH`, `SAVESCRATCH`, `CHANGEWHERE`, `LOGENTRY`
across `arexx.service.ts`, `rexx-host-dispatch.ts`, and `AREXXDoorSession.ts` returns zero hits —
none of CNet's host commands exist today, and the `GU`/`GETUSER` name collision with AmiExpress's
own alias would silently return AmiExpress-semantic data for CNet field IDs if naively reused.

**Conclusion for CNet:** not "already close" in the way the task brief speculated — the token
names coincide (`GU`, `GETUSER`, `TRANSMIT`, `SENDSTRING`) but the field-ID semantics and several
commands (`BBSIDENTIFY`, `LOADSCRATCH`/`GETSCRATCH`/`SAVESCRATCH`, `CHANGEWHERE`, `LOGENTRY`) do
not exist. This would need a parallel, CNet-specific host-command table and CNet user-record
field-ID map layered onto the *same* REXX interpreter/engine (no new interpreter needed) — a
moderate, self-contained addition, not a new IPC/binary protocol like DD or FAME. Given only 2
archives in the entire corpus, the effort-to-door-count ratio is poor next to S!X's zero-cost
outcome.

## Recommended plan of attack

1. **S!X — near-zero effort, do first.** No protocol code changes needed. Run the 11 identified
   real S!X-archive doors (all XIM) through the existing installer/catalog pipeline
   (`build-door-catalog.ts` / `door-installer.ts`) as a validation pass; treat failures as normal
   XIM bugs. Filter out the ~16 cracktro/intro executables and ~8 standalone CLI utilities from
   any door catalog — they are not doors and installing them would misclassify the archives.
   Effort: hours, mostly catalog/test bookkeeping, not new engineering.

2. **CNet — defer.** Only 2 archives exist in the corpus today. If/when a larger CNet door corpus
   materializes, scope a small addition: (a) a `CNET_HOST_CMD_ALIASES` table mirroring the
   pattern at `arexx.service.ts:3283`, routed by detecting CNet-style scripts (e.g. presence of
   `BBSIDENTIFY`/`LOADSCRATCH` calls, or an install-time flag) rather than always assuming
   AmiExpress semantics; (b) a CNet user-record field-ID map (reverse-engineer from more sample
   scripts — 2 samples aren't enough to build a reliable field table); (c) `LOADSCRATCH`/
   `GETSCRATCH`/`SAVESCRATCH`/`CHANGEWHERE`/`LOGENTRY`/`BBSIDENTIFY` host-command handlers. This
   reuses the existing REXX engine — no new interpreter or IPC layer. Effort: low-to-moderate
   (days, not weeks) but low payoff at current corpus size; not worth doing ahead of a larger
   CNet archive set showing up.

3. Do not build a "SIGMA/S!X protocol handler" — there is nothing to build; the mirror-the-XIM-
   stack pattern used for FAME/DD does not apply here because S!X isn't a fourth protocol, it's
   AmiExpress's existing XIM+TIM/PARADOOR protocols under different branding.
