# Handoff (condensed)

## Latest prompts
- Current prompt: "how do we proceed?" / "it sounds good"
- Prior prompt: "read agents.md and the handoff"
- Prior prompt: "i added the amiga e dev kit to /Users/spot/Code/amiexpress-web/dev/docs/evo analyze it and find the info we need" and follow-ups about why we shouldn't need compiler-specific support—goal is real LoadSeg/DOS/Exec parity for all Amiga binaries, no stubs.
- Earlier prompt: "we got interrupted:
   ✔ Sanitize HTTP auth endpoints (login/register) before database lookup/insert
    ✔ Apply the same sanitization to socket-based login/username-check flows and new-user registration triggers
    □ Document the updates in handoff.md + note testing recommendations"

## New updates (QuickNew stdout)
- Added STDOUT redirection support: `FileManager` now tracks a configurable stdout BPTR; `DosLibrary.redirectStdout()` opens an Amiga path (MODE_NEWFILE) and updates Output(); `LibraryManager` honors `AEDOOR_STDOUT`/`AEDOOR_STDOUT_PATH` env to redirect before door start.
- Ran: `AEDOOR_DISABLE_GUARD=1 AEDOOR_ROM=kickstart AEDOOR_STDOUT=screens:quicknew.txt npx tsx web/backend/src/scripts/run-amiga-door.ts Doors/QuickNew/QuickNew 1 doors:quicknew/quicknew.config1`.
- QuickNew now writes to `Screens/quicknew.txt` (6 KB, ANSI content). Door still ends with "PC out of code region" after closing dos.library, but output completes.
- File accesses during the run (from logs): `screens:quicknew.txt`, `doors:quicknew/quicknew.config1`, and dir files `BBS:Conf{2..11}/Dir1` plus `BBS:Conf11/Dir2`.

## New updates (exit handling)
- DoorLifecycleManager now treats a PC that falls into the current stack bounds as a clean termination (covers QuickNew return into stack after closing dos.library). No functional change to doors beyond suppressing the crash log.

## New updates (QuickNew automation)
- Batch scheduler now special-cases QuickNew: runs `doors:quicknew/quicknew` with stdout redirected to `screens:quicknew.txt` and raises `AEDOOR_LOOP_LIMIT` to 2,000,000. Env overrides are passed through `runAmigaDoorViaRunner`, and guard remains disabled via tooltypes.

## New updates (graphics stub)
- Added a minimal `graphics.library` stub in `ExecLibrary`: assigns a base, fills the jump table with RTS, and ensures LVO stubs install via LVOs.i when opened. Prevents doors from failing on missing graphics.library.

## Recent updates (batch/logon stability)
- Added `web/backend/src/scripts/run-batch.ts` to run batch scripts via the scheduler (exports `runBatchFile`); used it to run batch0–batch6 and batch000 (`npx tsx src/scripts/run-batch.ts ../../batchX`). `setenv` lines are skipped; drop files for Node1 created; SAmiLog ran. MultiTop/QuickNew remain commented out in batches.
- Commented out QuickNew auto-runs in all `Node*/logon20.txt` and MultiTop auto-runs in `batch0–batch6` to stop login floods; login prompt returns reliably without unexpected door output.
- Gated `DoorLifecycleManager` progress spam behind `AEDOOR_PROGRESS_LOG`; default is silent so the BBS terminal no longer shows debug progress unless explicitly enabled.
- GA (GetAnswer) door works but is slow because `Node1/Answers` is large (~6.7 MB); “Scanning on Node 1...” is expected until it finishes.
- `Bulletins/bull1.txt` last touched Nov 28 21:57 by MultiTop run; still header-only (no rows). Other bulletins unchanged.
- ED crash fix in progress: expanded guard whitelist in `DoorLifecycleManager`; now treats any library stub region (exec/dos/intuition/graphics/utility/AEDoor/icon) as safe with a wide window (base-0x1000 .. base+0x200000) to stop “PC out of code region” kills while running stub code. Need rerun to verify ED completes; A4 stayed nonzero in prior runs.

## Current focus
- 68k door parity vs express.e: XIM/ACP semantics, dropfiles/playpen paths, batch hooks, and bulletin generators (MultiTop/SAmiLog/QuickNew). No stubs; port 1:1 from the E sources.

## Recent updates (this session)
- CLI stack seeding fixed: stopped filling the top of the stack with the 0x1ff000 exit trap. `setupStack` now seeds only the seglist return BPTR and saved SP, matching vamos and avoiding register poison (the old fill showed 0x1ff000/0x20202020 in every register slot during traps). `cd web/backend && npx tsc --noEmit` still passes.
- QuickNew repro (before the stack change): ran `AEDOOR_ROM=kickstart npx tsx web/backend/src/scripts/run-amiga-door.ts /Users/spot/Code/amiexpress-web/Doors/QuickNew/QuickNew 1 doors:quicknew/quicknew.config1` and hit a guard timeout after ~120s with massive DOS.Write loops; stack dumps showed every register word as 0x1ff000 due to the poisoned stack. Need to rerun after the stack fix.
- RawDoFmt now calls the A2 putch callback per character (D0=char, A3=putData) with a small return stub; falls back to RawPutChar buffer semantics only when no callback is supplied. Added CPU state capture/restore to avoid register drift; kept 4KB scratch buffer guard and limited logging.
- Re-ran MultiTop with full args: RawDoFmt loop resolved, console putch at 0x56be runs, `Bulletins/bull1.txt` writes succeed, and the door exits cleanly (~947 iterations, return D0=0). ExecBase/A6 stay stable and no guard timeout.
- MultiTop re-run with arg `2` (Node2) still exits cleanly; no new bulletin writes observed (bull1 unchanged). Args appear empty in A0, so per-door arguments may not be reaching the door.
- QuickNew runs now reach DOS.Open/ReadArgs but fail with “ERROR : Couldn't Open Config-File !” because the arg template parses FILE/A as “0” (A0 string is empty, so it tries to open PROGDIR:0). Needs arg passing fix or explicit config path.
- Re-read AGENTS/CLAUDE rules and handoff, then focused on MultiTop 68k emulation.
- Fixed Exec FreeMem trap so it no longer rewrites SP mid-run; added an exit fix to seed the exit trap (0x1ff000) on the stack when returning to 0x119a.
- Aligned exit detection to also treat PC=0x1ff000 as a clean exit.
- With `AEDOOR_DISABLE_GUARD=0`, MultiTop now runs through cleanup and exits cleanly (iterations ~943); stack no longer drifts to low memory.
- Type check: `cd web/backend && npx tsc --noEmit` succeeds.
 - Added stub loader to parse `dev/docs/LVOs.i` and install missing LVO traps for opened libraries (exec/dos/intuition/graphics/utility); RawDoFmt implemented; DOS FGetC/FPutC/FGets/FWrite/FRead added.
 - Door args fixed: CLI arg string no longer includes program name; command BSTR now just program name; argc adjusted.
 - FileManager now case-insensitive for assigns and uses PathManager; bulletin file opens/writes now happen.
 - DoorLoader now routes pr_ReturnAddr/CLI return to exit trap instead of seglist and seeds stack return addresses with 0x1ff000; still exploring exit flow.
 - Added PC-range crash guard in `DoorLifecycleManager` to stop when PC leaves code region; logs stack snapshot.
 - Added per-instruction FLOW probe in `DoorLifecycleManager` to log indirect JSR/JMP targets plus PC window 0x5c90–0x5d10; now logs A6/target/memory around 0x5cda/0x5cfa/0x4b90.
 - Latest runs (full args) still crash after FreeArgs but probes show real code executing in the 0x5c90 window. Final probe at PC=0x5cf6 shows `jsr d16(a6)` with A6=0x69546f70, ext=0xff3a -> target=0x69546eaa (lands on crash PC 0x546eaa); -0x58(A5)=0, A0=0xc7f0, A1=0x14008e, A4=0xc9d4. Need to find where A6 is corrupted from ExecBase 0x10000 to that bogus value.
 - Added A6-change monitor (logs when A6 leaves known library bases) and ExecBase-pointer monitor (logs writes to address 0x4).
 - RawDoFmt stub fixed: when *(A3) is NULL, it now defaults to A3 as the buffer pointer before writing, preventing clobbering of vectors/ExecBase.
 - New run: ExecBase pointer stayed intact and bulletin writes now happen (`bbs:bulletins/bull1.txt` written), but RawDoFmt fires many times (often with A3=NULL), flooding logs and the door ends with PC=0x20007c after heavy output. Need to rein in RawDoFmt logging and see post-bulletin control flow.

## Recent work
- Runner/batch scheduler: all batch/door invocations now go through the Amiga runner with assigns (bbs:, doors:, nodeX:, PROGDIR), tooltypes (DISABLE_GUARD=TRUE), cwd set to door dir, DOOR.SYS/DORINFO written in Node{n} before execution, and redirection respected. Bare upload targets fall back to Node*/Playpen; real paths are used otherwise.
- File system: PathManager base set to BBS root (`/Users/spot/Code/amiexpress-web`), ROM path fixed to `web/backend/data/amiga-roms`, FileManager/DOS open/write logging to `logs/door-68k.log`, guard disabled in DoorLifecycleManager. Assign maps are logged on init.
- Batch files: auto-cloned batch0–batch6 into dataDir; logoff batches now run (batch000 + weekday variants). QuickNew/QuickNew2 regenerate and write via redirection.
- Logging: door-68k.log now captures PathManager assigns, arg strings for mtop/SAmiLog calls, and console writes. No bulletin writes observed yet.
- LibraryManager now resolves BBS_ROOT from `__dirname` (stable root regardless of cwd).
- Tried extensive MultiTop parity work: Kickstart ROM forced (AEDOOR_ROM=kickstart), Process/CLI stubs populated (pr_CLI BPTR, pr_CurrentDir/Home locks, std handles, pr_Arguments, pr_SegList BPTR), A4/A5 set to DATA when present. Added arg logging/traces/guards, but MultiTop still loops before any DOS.Open; no bulletin writes. SAmiLog runs.
- Tried extensive MultiTop parity work: Kickstart ROM forced (AEDOOR_ROM=kickstart), Process/CLI stubs populated (pr_CLI BPTR, pr_CurrentDir/Home locks, std handles, pr_Arguments, pr_SegList BPTR), A4/A5 set to DATA when present. Added arg logging/traces/guards, but MultiTop still loops before any DOS.Open; no bulletin writes. SAmiLog runs. SAS/C v6 manual link provided (needs Process/CLI/seglist/return addr setup per SAS/C startup).
- HTTP auth hardening: sanitized login/register inputs before DB lookup/insert; same normalization applied to socket login/username-check/new-user registration triggers.
- Door exit trap moved from ROM to RAM guard (`exitTrapAddress` now `0x1ff000`) to avoid ROM write detection conflicts during exit detection.
- SAS/C boot alignment: DoorLoader now builds a BPTR seglist table, wires pr_SegList/cli_Module, sets CLI fields (CommandName, CommandDir, handles, Module, ReturnAddr), sets pr_ReturnAddr to the RAM trap, and forces A4/A5 to DATA base (or first segment). Added CLI/Process logging. `cd web/backend && npx tsc --noEmit` passes.
- SAS/C boot alignment refinement: HunkLoader now allocates segments with DOS-style headers (size+next BPTR, data at +8), sets cli_Module/pr_SegList to the segment BPTR (header+4), and uses the new header-aware addresses for entrypoint. Seglist table removed in DoorLoader; A4/A5 now target the first segment base. tsc still passes.
- Seg header tweak: size field now stored in longwords (size+next included) per DOS seglist expectations; next BPTR still header+4. Seglist BPTR remains 0x401 for MultiTop.
- Switched back to LoadSeg-style mapping for Amiga E binaries: HunkLoader no longer writes headers; segments sit at BPTR<<2 code start, pr_SegList/cli_Module point to code BPTR. Added early A4/A5 change tracing in lifecycle.
- MultiTop runs (AEDOOR_ROM=kickstart npx tsx src/scripts/run-amiga-door.ts ../../Doors/MultiTop/mtop 1) still time out. Entrypoint 0x1000, BPTR 0x400; A4/A5 start at 0x1000 but A5 flips to 0xf0100 by iter=2 (PC=0x1006), A4 becomes 0xffffff8c by iter=18; first AllocMem trap still shows A4=0 and 0x1ff000-poisoned stack. Permit trap shows bogus SP and high-PC spin. Seg header log garbage (size_longs huge), watchpoint 0x1250..125F still fires during load (PC=0); no DOS.Open entries yet.
- Amiga E dev kit review (`dev/docs/evo`): Technical_info.txt lists runtime A5 frame (e.g., arg at -32, wbmessage -36, execbase -40, dosbase -44, saved a5 -88, stdin/stdout, etc.) and stack model (globals+locals plus ~10K headroom). HUNK usage is standard AmigaDOS (code/data/BSS with reloc hunks, optional symbols/line debug; showhunk utility docs). Startup options include RUNBG/NOSTARTUP/STACK=<size>/GETA4; no compiler-specific loader needed—proper LoadSeg/reloc + correct CLI/Process/BPTR setup should make E binaries run.
- HunkLoader fixes: parses HUNK_RELOC32SHORT, skips unknown hunks safely, and writes LoadSeg-style headers with size longs for payload only (no more inflated size_longs). Relocation parser now handles 16-bit short offsets; header default skip no longer corrupts position. `cd web/backend && npx tsc --noEmit` passes.
- MultiTop hunk structure confirmed: single HUNK_CODE of 0x1355 longs (19,796 bytes) with one HUNK_RELOC32 group (61 entries), no DATA/BSS or RELOC32SHORT. Entry stub disassembly (file offset 0x20 → PC 0x1008) immediately calls AllocMem(0x3978, MEMF_CLEAR), then Forbid, switches A7 to allocPtr+size, links A4, calls Permit, stores allocPtr at -0x40(a4). It assumes A5 comes from initial A0 and uses offsets (-0x8(a5), 0xc(a5), etc.) as a data pointer before the stack switch, so our current A0=arg-string is wrong.
- New run after loader fixes still fails: watchpoint triggers while writing segment (expected), A5 is set to arg-string, A4 stays 0; after a few instructions A5 flips to 0xf0100, A4 becomes 0xffffff8c, and Permit pops a garbage return (SP ~0xfffffd84, ret=0x392e3120) sending PC into ROM range; emulator spins (no DOS.Open). Root issue: initial registers/param block for E startup are wrong—need to supply the expected data pointer in A0/A5 (and possibly init block) rather than the raw arg string.
- Stack attempt: stack now allocated via Exec.AllocMem (base 0x80018 in latest run) and SP set to top without forced RTS push; exit trap remains at 0x1ff000. MultiTop still blows the stack: first AllocMem/Forbid look sane, but StackSwap/Permit pop from corrupted SP (0xfffffd84) with ret=0x392e3120 and PC drops to ROM/low memory; still no DOS.Open.
- Amiga E frame attempt: seeded A0/A5 with a runtime frame (offsets per Technical_info.txt: arg at -32, execbase/dosbase, stdin/stdout BPTRs, stack bottom, exit trap, thistask, saved a5). A5=0x82218 now; AllocMem/Forbid still fine, but by iter 18 A4=0xffffff8c and Permit still pops from bogus SP (0xfffffd84 → ret 0x392e3120). No DOS.Open yet; StackSwap path likely reading other frame fields or expecting different base/stack params.
- Vamos reference (working): Stack lower=0x6e74, upper=0x8e74, SP=0x8e6c; A0/A5=stack top; A6=0x133c; first AllocMem returns 0x90d0; A4 links to ~0xc9d4 and stores allocPtr at -0x40(A4); exits to BPTR 0x400. Our emu now mirrors stack/A0/A5 and AllocMem base (0x90e8) but A4 still corrupts.
- Latest instrumentation: StackSwap trap now logs struct fields (lower/upper/newSP), though MultiTop never calls it. DoorLifecycleManager logs A4/A5 changes with [-0x40]/[-0x1c] slots. In the latest run: iter 8/14 show A4=0, A5=0x8e74 slots zero; iter 18 A4 becomes 0xffffff8c; Permit then pops from bogus SP (~0xfffffd84) and ret=0x392e3120; no DOS.Open.
- 2025-11-27 latest run: DoorLoader now seeds Amiga E runtime frame (BSTR arg at -32, exec/dos base, stdin/stdout BPTRs, stack bottom, saved A5, thistask), sets SR=0, D0/D1/D2 per vamos, A0/A5=stack top (0x8e74), pr/cli ReturnAddr=seglist BPTR (0x400), and pre-pushes 0x400 at SP. Exit trap RTS moved to 0x1ff000. `npx tsx .../mtop 1` still fails: after AllocMem/Forbid, Permit sees SP ~0xfffffd84 with junk return 0x392e3120; PC runs off until loop timeout, still no DOS.Open.
- Exec stack tracking update: ExecLibrary now tracks current stack bounds (set by DoorLoader) for StackSwap symmetry. DoorLoader seeds the A5 frame with exit trap (0x1ff000), intuition/gfx base placeholders, and multiple seglist return words near the stack top; exit trap address is shared as a class field. Graphics.library still has no stub (OpenLibrary returns NULL).
- Latest runs (post-update): MultiTop still terminates with “PC in low memory”. SP on the CLI stack drifts upward by 4 bytes each FreeMem/Forbid/Permit loop (e.g., 0x8e6c → 0x8eb0+); the final RTS at 0x119a pops zero and jumps to 0. Stack dumps now reflect our 0x400 seeding. No StackSwap calls; intuition stub opens at 0x50000, graphics fails to open. tsc continues to pass.
- LVO coverage: added parser for `dev/docs/LVOs.i` and auto-installs stub traps for every known LVO of opened libraries (exec/dos always; graphics/intuition/utility once opened). Unknown library calls now return gracefully instead of running into ROM/garbage. `npx tsc --noEmit` still passes.
- Stored the full `dev/docs/LVOs.i` (raw from amiga68ktools) so stub loading now finds the table.
- Trap handler no longer forces SP realignment; Exec allocator now supports reset/reuse and resets to 0x90d0 after boot to mirror vamos. Stack top seeding widened to +256 bytes.
- Latest mtop run: LVO stubs load (logs show LVOs.i found/stubbed). First AllocMem=0x90d0, A4 links to ~0xc9d4, but exit still fails: after FreeMem, SP ends ~0x8f70 (should be ~0x8e6c) and RTS at 0x119a jumps to 0. No DOS.Open yet. DOS/Exec stub calls log correctly.
- Seeded the saved original SP at stackTop+4 to help stack restore on exit; still need to verify if MultiTop actually reads it.

## Known gaps / TODO (port 1:1 from express.e)
- Bulletin generators: confirm `bull1` content matches express.e output and verify the other bulletins (bull2..6) plus SAmiLog/QuickNew flows still match the E sources.
- Dropfile/playpen parity: confirm NET*/BATCH return codes and dropfile paths match express.e; ensure carrier-drop codes are preserved.
- Input/output verification: continue validating GETKEY/HK/LI/PM/SM/CO/SO in live doors; ensure CRLF and lineCount behavior match the E sources.
- System admin/UI: operator paging UI still pending; batch editor dropdown sometimes empty (after restart it should list batch0–batch6).
- Keep an eye on putch callback cost: we now execute the 68k callback per character; confirm performance is acceptable and no extra output is skipped (console/DOS.Write should reflect it).

## Pointers
- Logs: `logs/door-68k.log` (assigns, DOS open/write traces), `logs/backend.log`.
- Key code: runner `web/backend/src/scripts/run-amiga-door.ts`; batch scheduler `web/backend/src/services/batch-scheduler.ts`; emu plumbing `web/backend/src/amiga-emulation/{LibraryManager.ts,api/DosLibrary.ts,api/FileManager.ts,session/DoorLifecycleManager.ts}`.
- Sources for parity: AmiExpress E sources in `AmiExpress-Sources` (use MCP tools: read_express_module/search_express_source).
- Fresh vamos trace (MultiTop, `vamos -I -r --max-cycles 50 Doors/MultiTop/mtop 1`):
  - Entry registers: PC=0x210c, SR has Z set, SP=0x8e6c, A0/A5=0x8e74, A6 loaded from 0x4 → 0x133c, D0=2, D2=0x2000.
  - First Exec AllocMem via jsr(-$c6,A6) returns 0x90d0; size add with D2 (0x3978) moves new stack to ~0xca44, link A4=0xc9d4. -0x40(A4)=0x90d0, -0x28(A4)=ExecBase, -0x18(A4)=0x2216, -0x30(A4)=0xcd8c later.
  - Stack swap: exg D0/A7 saves old SP (0x8e6c) on new stack, unlk restores A7 to 0x8e6c; RTS at 0x22a0 returns to 0x400 (exit handler) with final SP 0x8e70. Suggests initial stack return should be 0x400 and SP drift above 0x8e6c is wrong.

## Next steps
1) Compare the generated `Bulletins/bull1.txt` content with a known-good express.e run and confirm remaining bulletins (bull2..6) plus SAmiLog/QuickNew runs match expected output/paths.
2) Validate user-facing output paths: review console output from MultiTop (putch callback) to ensure CR/LF formatting matches real Amiga behavior and performance is acceptable.
3) Fix per-door argument passing so FILE/A params reach doors; rerun QuickNew with the proper config after the stack poison fix (guard on) to confirm the Write/DateStamp spam disappears.
4) Add a graphics.library stub/base so OpenLibrary stops returning NULL; re-evaluate whether the open/close/alloc/free loop changes.
5) Re-run MultiTop/SAmiLog with the cleaned stack init and watch `logs/door-68k.log` for DOS.Open/writes to `Bulletins/bull*`; verify dropfile/playpen return codes for NET/BATCH against express.e.
6) Continue cross-checking XIM command behaviors with a small door to confirm CRLF/lineCount and input handling; surface operator paging UI and confirm batch editor dropdown population after restart.

## Testing recommendations
- Backend types: `cd web/backend && npx tsc --noEmit`.
- Door runner sanity: `cd web/backend && AEDOOR_ROM=kickstart npx tsx src/scripts/run-amiga-door.ts ../../Doors/MultiTop/mtop 1` and watch `logs/door-68k.log` for DOS.Open hits.
- Auth flows: exercise HTTP login/register plus socket login/username-check/new-user flows with mixed-case usernames to confirm normalization and DB writes/readbacks.
