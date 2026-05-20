# Mining failures report (session 2026-05-14/15)

Doors probed during the +260 corpus-mining run, broken down by failure mode.

## Failure modes

- **0bytes** — door starts and exits silently, no output → can't be regression-pinned without scripted BBS state
- **exit-err** (mostly exit=124 = harness timeout) — door hangs waiting for input we don't script
- **NONDET** — output drifts run-to-run beyond what the time-mask covers (live clocks, random data, races)
- **dup-id / dup-path** — already covered by an existing corpus entry

## Counts (Round 8 = batch 3 of hunk-mining)


OK:        9
0bytes:    70
exit-err:  21
NONDET:    0

## 0-byte exits (need scripted BBS state)

- `PIW-ST05:RPStart`
- `AFL-DC05:AFL-DupeCheck`
- `MST-WH20:NI`
- `MST-WH20:No`
- `MST-WH20:Count`
- `TRSIBV14:TRSI_BULLVIEW`
- `DPL-GB11:AEDoor.library`
- `KLRCOM11:KC-Config`
- `TRSI-MSG:MSGEdit`
- `CDDC_10:cddc`
- `RYL-SWH3:amenophisADDY.exe`
- `RYL-SWH3:SWhoCallCounter`
- `TON-FCV1:rexxextra.library`
- `TON-FCV1:rexxtricks.library`
- `TON-FCV1:easyrexx.library`
- `TON-FCV1:rexxsupport.library`
- `TON-FCV1:SAD-Dsort.exe`
- `TON-FCV1:SAD-CCut.exe`
- `M!BBVW01:BB-View`
- `CHATSRC:sonnencreme.exe`
- `CHATSRC:Chat-O-Top`
- `LED-CB10:Phreak.exe`
- `LED-CB10:CrazyBull`
- `TSN-SSTP:SStrip`
- `5D_VL012:AVAIL`
- `DFBV13:sonnenbrand.exe`
- `WARPS_23:WarpSearch_shell`
- `DFBV13:ReadDFB`
- `DFBV13:DFBLogin`
- `DFBV13:DFBSection`
- `DFBV13:DFBMakeKeyFile`
- `DFBV13:MaxsPatch`
- `DFBV13:DFBCheck`
- `DFBV13:DFB_UserStats`
- `DFBV13:DFBFlg`
- `DFBV13:DFBArchivers`
- `DFBV13:DFBUser`
- `DFBV13:append`
- `DFBV13:DFBPrefs`
- `DFBV13:dfb_read`
- `PROTEC17:Protector`
- `PROTEC17:shutdown.library`
- `UPL10:guide`
- `UPL10:dfree`
- `ATX-SAL5:SAmiLog`
- `ATX-T101:TBar1.1`
- `WS-SH263:WarpS_sh.060`
- `WS-SH263:WarpS_sh.030`
- `WS-SH263:WarpS_sh.000`
- `CLE-UC12:UC.LoGCreaTor`
- `BOSSTOP:bosstop`
- `OTL-JC12:Install.exe`
- `TRSI-DLS:rexxsyslib.library`
- `FAMEWH12:FAMEWHO.FIM`
- `LZX_IDFX:SSP_LZXCheck.exe`
- `ATX-SAL2:SAmiLog_v106`
- `DTR!-J21:JoinConf.fim`
- `AD-KMHH1:RAWPLAY`
- `CURSELAS:6OC-!SGM.EXE`
- `AF_VHS2:Beavis&Butt.RUN`
- `LSD_A337:AE-REGISTERv1.05`
- `LSD_A337:acp`
- `UNI-SR10:Super-Request`
- `YDL-MENS:comlist`
- `YDL-MENS:frame`
- `YDL-MENS:cmg`
- `HF-IS1O:iDsTRiP`
- `HF-IS1O:DMSDescript`
- `HF-IS1O:EXEDescript`
- `HF-IS1O:TextDiz`

## Timeout / exit-err (need scripted input)

- `PIW-ST05:rexxport` SKIP=exit124
- `PIW-ST05:rexxdoor` SKIP=exit124
- `DLT-UL11:userlist` SKIP=exit124
- `DPL-GB11:GoodBye.x` SKIP=exit124
- `DPL-GB11:GoodBye.x.030` SKIP=exit124
- `MDBZS103:MDB-Search` SKIP=exit124
- `SR-FC100:FiLECOMMENT` SKIP=exit124
- `LSD-AEC1:AECrack` SKIP=exit124
- `5DPAGE28:5D-Page` SKIP=exit124
- `DFBV13:DFBTAGSHOW_V1.1` SKIP=exit124
- `DFBV13:DFBTAGKILL_V1.0` SKIP=exit124
- `ATX-SAL5:rUNmEfORiNFOZ.eXE` SKIP=exit124
- `DDTWALL:DreamTagWall` SKIP=exit124
- `CURSELAS:curseupdate` SKIP=exit124
- `LSD_A337:newchat` SKIP=exit124
- `FG-FC26:fullchat` SKIP=exit124
- `TRB-SNFO:SyS.exe` SKIP=exit124
- `DPL-MC12:MessClean.030` SKIP=exit124
- `DPL-MC12:MessClean` SKIP=exit124
- `TRSICD1P:SmallTalk` SKIP=exit124
- `NE-COM01:sKY!cOMMENT` SKIP=exit124

## Non-deterministic (output drifts beyond mask)


## Known earlier-session failures

| Door | Why | Status |
|---|---|---|
| `WORLD-CLOCK` | Live clock, mask can't cover | Skipped — deferred |
| `PTLNOT10 NoTiFieR` | Random animation frame | Skipped — deferred |
| `VTY-CM11 Meter.030` | Output content drift | Skipped — deferred |
| `cdshel_cdshell` | Trace off-by-one (race) | Added then dropped |
| `confscan` | BBSCmd → BBSNO rename broke its config-find | Restored, now passes |
| `S!X39N2 SDupeCheck` | Output drift, timing-dependent | Skipped — flaky |
| `AutoReward` (early session) | Spawns background task that never exits | Skipped — needs SIGTERM in harness |
| `AEHydra` | Needs full .info install + icon.library GetDiskObject | Deferred — needs synthetic config |
| `chat3.4 / THCChatter` | Multi-user chat loop, never JH_SHUTDOWNs | Deferred — non-deterministic |
