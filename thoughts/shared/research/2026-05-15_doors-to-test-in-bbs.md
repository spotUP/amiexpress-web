---
date: 2026-05-15
topic: doors-to-test-in-bbs
tags: [doors, corpus, mining, regression]
status: draft
---

# Doors that failed corpus mining — try in the live BBS

These 89 binaries were probed via the headless `run-amiga-door.ts`
harness during the 2026-05-14/15 corpus-mining sprint and either
exited silently (no output) or hung waiting for input. They may
work fine in the live BBS where you have real session state
(user record, conference, file area, etc.) and can supply
interactive input.

Each row is the source archive (under `/tmp/bp-full/extracted/`)
and the binary inside it.

## Doors — invokable, worth interactive testing

| Archive | Binary | Notes |
|---|---|---|
| `5DPAGE28` | `5D-Page` | Sysop pager |
| `LSD-AEC1` | `AECrack` | Crack detector |
| `MDBZS103` | `MDB-Search` | File search |
| `UNI-SR10` | `Super-Request` | File request |
| `DLT-UL11` | `userlist` | User-list viewer |
| `LSD_A337` | `newchat` | Multi-user chat |
| `FG-FC26` | `fullchat` | Chat |
| `M!BBVW01` | `BB-View` | Viewer |
| `DPL-GB11` | `GoodBye.x` / `GoodBye.x.030` | Logoff |
| `DPL-MC12` | `MessClean` / `MessClean.030` | Message cleaner |
| `TSN-SSTP` | `SStrip` | Text stripper |
| `HF-IS1O` | `iDsTRiP` / `EXEDescript` / `DMSDescript` / `TextDiz` | File-id strippers |
| `NE-COM01` | `sKY!cOMMENT` | Comment |
| `KLRCOM11` | `KC-Config` | KiLLER Comment config |
| `SR-FC100` | `FiLECOMMENT` | File comment |
| `DTR!-J21` | `JoinConf.fim` | FIM-class JoinConf |
| `FAMEWH12` | `FAMEWHO.FIM` | FIM-class who |
| `WARPS_23` | `WarpSearch_shell` | Search shell |
| `WS-SH263` | `WarpS_sh.000` / `.030` / `.060` | Search shell CPU variants |
| `ATX-T101` | `TBar1.1` | Status bar |
| `LZX_IDFX` | `SSP_LZXCheck.exe` | LZX archive check |
| `TRSI-MSG` | `MSGEdit` | Message editor |
| `TRSIBV14` | `TRSI_BULLVIEW` | Bulletin viewer |
| `RYL-SWH3` | `SWhoCallCounter` | Who/call counter |
| `OTL-JC12` | `Install.exe` | Installer |
| `DDTWALL` | `DreamTagWall` | Tag wall |
| `LED-CB10` | `CrazyBull` / `Phreak.exe` | Bulletin |
| `BOSSTOP` | `bosstop` | Top callers |
| `MST-WH20` | `NI` / `No` / `Count` | Who variants |
| `5D_VL012` | `AVAIL` | Avail (Volcano) |
| `AD-KMHH1` | `RAWPLAY` | Audio play |
| `AF_VHS2` | `Beavis&Butt.RUN` | Themed login |
| `CDDC_10` | `cddc` | CD descriptor |
| `CHATSRC` | `Chat-O-Top` / `sonnencreme.exe` | Chat |
| `CLE-UC12` | `UC.LoGCreaTor` | UC log creator |
| `CURSELAS` | `6OC-!SGM.EXE` / `curseupdate` | Curse-last variants |
| `RYL-SWH3` | `amenophisADDY.exe` | Add user |
| `TRB-SNFO` | `SyS.exe` | Sysinfo |
| `TRSICD1P` | `SmallTalk` | SmallTalk |
| `UPL10` | `dfree` / `guide` | Upload helpers |
| `YDL-MENS` | `cmg` / `comlist` / `frame` | YDL toolkit |

## Whole packs (install + try as a unit)

- **DFBV13** (13 binaries): `append`, `dfb_read`, `DFB_UserStats`,
  `DFBArchivers`, `DFBCheck`, `DFBFlg`, `DFBLogin`, `DFBMakeKeyFile`,
  `DFBPrefs`, `DFBSection`, `DFBTAGKILL_V1.0`, `DFBTAGSHOW_V1.1`,
  `DFBUser`, `MaxsPatch`, `ReadDFB`, `sonnenbrand.exe` — DFB file-base
  toolkit
- **ATX-SAL5 / ATX-SAL2**: `SAmiLog`, `SAmiLog_v106`, `rUNmEfORiNFOZ.eXE`
  — Super-AmiLog
- **TON-FCV1**: `SAD-CCut.exe` / `SAD-Dsort.exe` (sort cutters)

## Libraries / shells — NOT invokable as doors

These produced 0-byte exits because they're ABI components (not
user-callable doors). Don't bother testing as doors:

- `TON-FCV1:rexxsupport.library`, `rexxextra.library`,
  `rexxtricks.library`, `easyrexx.library`
- `TRSI-DLS:rexxsyslib.library`
- `PROTEC17:shutdown.library`
- `PROTEC17:Protector`
- `DPL-GB11:AEDoor.library`
- `PIW-ST05:rexxdoor`, `rexxport`, `RPStart` (rexx infra)

## How to install one for the live BBS

```bash
# Pick a candidate
SRC=/tmp/bp-full/extracted/MDBZS103/BBS/Doors/MDB-Search/MDB-Search
mkdir -p Doors/MDB-Search
cp "$SRC" Doors/MDB-Search/

# Wire it up via Commands/BBSCmd/
# (create an .info file pointing at the binary — see existing
#  Doors entries in Commands/BBSCmd/ for the format)
```

## Why each failed the harness

- **0-byte exits** — door bootstrap completes but exits silently. Most
  likely needs real BBS session data (user, conference, file area,
  flags) which the headless harness doesn't supply. Often works fine
  for a real logged-in user.
- **exit-err / timeout** — door blocks on JH_HK / JH_LI input that
  needs a specific keystroke we don't script. Works fine with a real
  user typing input.
- **NONDET** (separate list, not included here) — output drifts
  beyond what the time-mask catches (animations, live counters,
  random colors). May be perfectly usable in the BBS even though
  it can't be regression-pinned.

## Source

Generated from `/tmp/fast-mine.full.log` during round 8 of corpus
mining (2026-05-15). Full machine-readable path list at
`/tmp/failed-paths.txt`.
