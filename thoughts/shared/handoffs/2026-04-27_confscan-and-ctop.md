---
date: 2026-04-27
topic: ctop-confirmed-fixed
tags: [ctop, conftop, doorman, upload-install, info-editor]
status: final
---

## CTOP — CONFIRMED FIXED (2026-04-27)

Ran `Doors/Conftop/ctop` through the debug sandbox twice (first run = no Conftop.Data; second run = reads fresh files). Both runs exit 0, output "Day (6/7 - 1 days left)", no "Reset date is out of range" error.

Root cause chain (resolved):
1. Write() binary corruption bug (bytes ≥ 0x80 → 0x20) corrupted `Conf*/ctop.data` and `Conf*/Conftop.Data` timestamp bytes
2. Corrupted timestamps failed the date range check in `Conftop020.x` and Conftop-II
3. Fix: Write() bug patched; corrupted files deleted 2026-04-27 → fresh creation on next run
4. `ctop` (Conftop-II) uses `ctop.data`; `Conftop020.x` (v2.3) uses `Conftop.Data` — both now created correctly

Key file refs:
- `Doors/Conftop/ctop` = Conftop-II V0.99, the XIM door (Commands/BBSCmd/ctop.info)
- `Doors/Conftop/Conftop020.x` = Conftop v2.3 standalone updater
- `Conf*/ctop.data` = Conftop-II data (16-bit ds_Days counts)
- `Conf*/Conftop.Data` = Conftop v2.3 data (2-byte magic + 4-byte Unix timestamp)

## Doorman upload/install + .info editor — SHIPPED (2026-04-27)

Full implementation landed in main. See plan at docs/superpowers/plans/2026-04-27-doorman-upload-install-infoedit.md.

Key commits:
- feat(lzx): amiga-lzx WASM crate (pack + extract)
- feat(lzx): replace stub extractor with WASM implementation
- feat(installer): DoorInstaller with TS + 68K door detection
- feat(bbsapi): requestArchiveUpload() and installDoor()
- feat(upload): socket handler for door archive uploads
- feat(doorman): InfoEditorOverlay + [U]/[I] keybindings

## Next

- DEL (MgzListMan): still open — AEDoor.library direct-call protocol investigation needed
- eall messages in Conf*: msgNumb=0 from when highMsgNum was 0; future messages will have proper numbers
