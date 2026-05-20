---
date: 2026-05-18
topic: upload/download parity diff — express.e vs TypeScript port
tags: [audit, parity, upload, download, express-e]
status: in-progress
---

# Upload / Download Parity Diff

## Closed in this session (commits)

| Item | Commit | Notes |
|---|---|---|
| U2 disk CallersLog/UDLog dual-write | `994aa7850` | runPostUpload writes to both |
| U3 KEEP_UPLOAD_CREDIT persist | `994aa7850` | half-credit to user.timeTotal on disk |
| U5 cleanPlayPen | `3bd245d7e` | leftover playpen → PartUpload/@slot |
| U1 + D14 displayUserToCallersLog(1) | `950938607` | per-session UDLog header + beenUDd gate |
| D1+D2+D4+D11+D12+D13 runPostDownload | `814defaaf` | shared post-transfer pipeline web/telnet/SSH |
| D15 disk CallersLog/UDLog dual-write | `994aa7850` | runPostDownload writes to both |
| D16 Restricted-comment file rejection | `a9a542080` | per express.e checkFIBForFileSize |
| (regression tests for above) | `74f218076` | 13/13 pass; pins shape against future drift |
| D9 pGoodbye 10-sec countdown telnet/SSH | `a2451134f` | startPGoodbye made callable; runPostDownload owns trigger now |
| U6 resumeStuff interactive prompt | `bc7f24961` | Y/N per partial + Delete (Y/N/All); fires before lrzsz spawn |

## Verified already in code (no action needed)

| Item | Location | Notes |
|---|---|---|
| U4 sysopULStats both counters | `utils/upload-notify.util.ts:42` | updates both Conf/NumULs + SysopStats/NumULs_n |
| U8 CREDITBYKB toggle partial | `download-ratios.util.ts:89` etc | ACS toggle wired, ratio uses it, format util respects it; full propagation still UNVERIFIED |
| D5 clearFlagItems after batch | n/a | flagged-files cleared in batch-download.handler.ts |

## Open

Synthesizes the two audit docs:
- express.e: `2026-05-18_express-e_upload_download_audit.md`
- TypeScript: `2026-05-18_ts_upload_download_code_map.md`

Format: each row is a behavior in express.e + status in TS + impact + fix sketch.

---

## UPLOADS — close to parity

Web-picker pipeline is comprehensive (`processBatchFile` at `file-socket-handlers.ts:264`). After the recent unification, telnet/SSH `RZ` (lrzsz + zmodem.js fallback) routes through the same per-file pipeline + shared `runPostUpload`. Gaps below are real but small relative to the download situation.

| # | express.e step | TS status | Impact | Fix |
|---|---|---|---|---|
| U1 | `displayUserToCallersLog(1)` once per session (gated by `beenUDd`) — writes udLog divider header — express.e:19046-19049 | MISSING — TS callersLog has no "first U/D divider" marker; `beenUDd` flag not modeled | Low (cosmetic in CallersLog) | Add `session.beenUDd` flag; on first upload OR download write a divider line via callersLog |
| U2 | `udLog` is a separate log file (not the same as CallersLog) — express writes BOTH on per-file + batch events — express.e:19095-19101 | MISSING — TS only writes to CallersLog; no separate UD log | Medium (sysop loses per-session U/D summary file) | Add `udLog()` helper writing to `<confDir>UDLog` (or per-node UD log per express.e); call alongside every `callersLog` in upload+download paths |
| U3 | Time credit persisted to disk when `LVL_KEEP_UPLOAD_CREDIT > 0`: `loggedOnUser.timeTotal += peff/2` — express.e:19137 | MISSING — TS only adjusts session.timeLimit, never persists half-credit to user.data | Medium (user loses persistent time bonus) | In `runPostUpload`: when ACS check `KEEP_UPLOAD_CREDIT` true, `user.timeTotal += Math.floor(peff/2)` and `userFileManager.updateUserDataFile(user, slot)` |
| U4 | `sysopULStats(hold)` increments `<confDir>NumULs` (or `_<n>HOLD`) AND `SysopStats/NumULs_<n>` — express.e:19440, 18746-18787 | PARTIAL — `updateSysopUploadStats` called but only updates one of the two counters | Low | Verify both counters update; if not, extend `updateSysopUploadStats` |
| U5 | `cleanPlayPen()` moves leftover playpen files to `<confDir>PartUpload/<fn>@<slot>` so `resumeStuff()` can find them next session — express.e:19520, 18259 | MISSING — TS never moves to PartUpload | Medium (partial uploads lost on disconnect) | Add `cleanPlayPen()` in `runPostUpload`; iterate playpen, move to `PartUpload/<fn>@<slot>` |
| U6 | `resumeStuff()` prompts user "Resume <fn> [size] (Y/N)?" for any `<conf>PartUpload/...@<myslot>` files — express.e:19018-19023, 18119-18257 | MISSING — no resume prompt exists | Medium (users can't resume partial uploads) | Add `runResumePrompt(session)` early in upload entry handlers; wire to PartUpload dir |
| U7 | `uploadDesc()` interactive batch — "FileName N:" prompts + B (toggle bg-check) / G (goodbye after) / L (local console) / A (abort) — express.e:17650-17797 | MISSING — `U` command not implemented in telnet/SSH; only `RZ` (no-prompt) | Medium (telnet/SSH users have no way to upload with description batch up-front) | Add `internalCommandU` handler (`U` command) + telnet/SSH `runUploadDescPrompt(session)` line-buffered |
| U8 | `CREDITBYKB` toggle: when `sopt.toggles[TOGGLES_CREDITBYKB]` is on, ALL byte counters store kilobytes (`fsize >> 10 & 0x3FFFFF`) — express.e:19444-19447, 19069-19073, and ratio calcs | UNVERIFIED — TS likely stores plain bytes; honoring this toggle isn't clear | Low/Med (admin-toggleable; many sites leave default) | Audit byte-counter writes; gate KB conversion on a `bbsConfig.creditByKb` flag |
| U9 | Mail-attach upload: `uploadaFile(0,'',TRUE)` with target `<msgBase>F<n>/<fn>` — express.e:10721-10741 | UNVERIFIED — TS likely supports this via web picker but not confirmed | Medium (mail attachments may go to wrong directory) | Trace the mail-compose attach flow; verify destination dir matches express.e |
| U10 | `zmdupecheck` registers in-flight uploads across nodes via `sendMasterUpload(fname)` so two nodes can't simultaneously accept the same filename — express.e:13426 | MISSING — no multi-node coordination | Low (rare; only matters for multi-user concurrent uploads) | Defer — would need a shared lock/registry |
| U11 | `skipdFiles` listing post-transfer: walks list, prints "Skipped <name>" per file + "...SKIPPED. They already exist or have symbols." — express.e:19112-19125 | UNVERIFIED — duplicate detection exists but skipped-file UX may differ | Low | Verify by uploading a file with same name as existing |
| U12 | DIRn col-13 status flag = `F`/`P`/`N`/`D`/`checksym` — express.e:19451-19470 | PRESENT — `checkedMarker` set to same values at file-socket-handlers.ts:403 | OK | — |
| U13 | `freeDiskSpace()` global check + 2MB playpen floor + `RAMWORK` tooltype override — express.e:18989-19001 | **CLOSED 2026-05-20** — `displayUploadInterface` enforces `MIN_PLAYPEN_BYTES = 2*1024*1024` via shared `readFreeBytes(ulPath)` before transitioning to UPLOAD_FILENAME_INPUT; refuses with express.e parity text "Not enough free space for uploading!". 6 grep regression tests in `tests/upload-disk-space-floor.test.ts`. RAMWORK tooltype skipped — web has no ramdisk-override concept. | — | done |

## DOWNLOADS — major gaps

`download.handler.ts` runs the **pre-transfer** flow (ratio check, file selection, LAST CHANCE prompt). Once lrzsz `sz` or zmodem.js fires, there is **no post-transfer accounting at all**. This is the biggest parity hole in the project.

| # | express.e step | TS status | Impact | Fix |
|---|---|---|---|---|
| D1 | `updateDownloadStats(fileItem, fsize, sentsize)` per file — `dlFileCount++`, `addBCD(dTBT, sentsize)`, conf-or-user `downloadBytesBCD/bytesDownload/downloads`, `dailyBytesDld`, `bytesADL` — express.e:15429, 16878 | **MISSING for lrzsz + zmodem.js paths** — `updateDownloadStats` exists in `download-ratios.util` but is never called from those onComplete handlers | **High** — users get free downloads (no ratio cost, no daily limit decrement) | Wire `onComplete` to call `updateDownloadStats` per file |
| D2 | Aggregate stats line: "<N> files, <kb>k bytes, <m> minutes <s> seconds <cps> cps, <eff>% efficiency at <baud>" — express.e:20262-20268 | **MISSING for lrzsz + zmodem.js** | **High** — UX regression | Mirror `runPostUpload`: build `runPostDownload` shared service |
| D3 | Top-CPS download persist: `IF pcps > dnCPS2 THEN dnCPS2:=pcps; oldDnCPS:=Min(pcps,65535)` — express.e:20271-20275 | **MISSING** | Medium (cosmetic stat) | Include in `runPostDownload` |
| D4 | Aggregate callersLog: `\tDownload <agg-line>` when files>0, else `\tDownload Failed..` — express.e:20280-20289 | **MISSING for lrzsz + zmodem.js** | High | Include in `runPostDownload` |
| D5 | `clearFlagItems(flagFilesList)` after successful batch — express.e:20249 | UNVERIFIED — may exist in batch-download.handler.ts | Medium | Verify; otherwise add |
| D6 | `clearFlagItems(finalList); END finalList` — express.e:20277 | UNVERIFIED | Low | Verify |
| D7 | `displayULStats(loggedOnUser, loggedOnUserMisc)` post-download — express.e:20311 | **MISSING** | Low (display polish) | Include in `runPostDownload` |
| D8 | `statPrintUser()` status-window refresh — express.e:20316 | N/A (no Amiga status window in TS) | — | — |
| D9 | `pGoodbye()` countdown on user-picked G — express.e:20317, 13750 | **MISSING for lrzsz + zmodem.js** (web batch may have it) | Medium | Include G-after-transfer in lrzsz/zmodem.js path |
| D10 | Hydra reverse-upload: post-download `uploadaFile(0,'',FALSE,TRUE)` — express.e:20307-20308 | N/A — Hydra not supported | — | — |
| D11 | `lastDlCPS` persist: `loggedOnUserMisc.lastDlCPS := pcps` for next session's ratio estimate — express.e:20259 | MISSING | Low | Include in `runPostDownload` |
| D12 | `dailyBytesDld += fsize` per file — express.e (in updateDownloadStats) | MISSING | High (daily ratio gate broken on lrzsz/zmodem.js downloads) | Tied to D1 fix |
| D13 | `bytesADL -= fsize` (unless `$7fffffff` infinite) — express.e (in updateDownloadStats) | MISSING | High (today-bytes limit broken) | Tied to D1 fix |
| D14 | `displayUserToCallersLog(1)` first-time-this-session udLog header — express.e:20242-20245 | MISSING | Low | Same as U1 |
| D15 | `udLog` writes (separate from callersLog) per express.e:20280-20289 | MISSING | Medium | Same as U2 |
| D16 | Restricted file rejection: comment starts `Restricted` → `\t\tAttempt to download RESTRICTED file [<path>]` to callersLog + skip — express.e checklist path | **PARTIAL → CLOSED 2026-05-20** for the main paths: single-file filespec gate at `download.handler.ts:340` (pre-existing); batch / F+D path at `batch-download.handler.ts:81` (added). Both reject Restricted files, log the attempt to callersLog, and `continue`. The user-commands.handler.ts:930 direct-D-flagged path still bypasses (`FlaggedFile` doesn't carry comment metadata; gating needs per-file DIR lookup) — annotated with a TODO in code; less-common telnet/SSH-only path. 4 regression tests in `tests/batch-download-restricted.test.ts`. | Low remaining | TODO for the third path |
| D17 | Free Download flag (comment starts `F` or global `freeDownloads`) skips ratio cost — express.e checklist path | UNVERIFIED in lrzsz path | Medium (cost charged for files that should be free) | Audit |
| D18 | `ACS_CONFERENCE_ACCOUNTING` branch: stats go to `cb.downloadBytesBCD`/`cb.downloads` instead of user counters — express.e:15445-15452 | UNVERIFIED | Medium | Audit; gate write target on this ACS |
| D19 | Pre-transfer `checkRatiosAndTime(...)` returning 0/1/2 controls UI flow — express.e:20108-20114 | PARTIAL — TS has ratio checks but the 3-way return may differ | Low | Verify against express.e:19823 |
| D20 | Per-conf `tfsizes`/`freeDFlags` accumulators built during checklist phase — express.e:20057-20097 | UNVERIFIED | Low | Audit `download.handler.ts:158+` |

---

## Prioritized fix list

**P0 (do now)** — observable user-facing regressions, security-adjacent:
1. **D1+D2+D4+D11+D12+D13**: extract `runPostDownload` shared service mirroring `runPostUpload`. Wire lrzsz + zmodem.js download `onComplete` to it. Includes `updateDownloadStats`, aggregate stats line, callersLog summary, `dailyBytesDld`/`bytesADL` decrement, `lastDlCPS` persist.
2. **D9**: G-after-transfer (`pGoodbye`) handling in download `onComplete` — currently impossible to "logoff after download finishes" on telnet/SSH.

**P1 (do this week)** — meaningful UX/admin features:
3. ~~**U5**: `cleanPlayPen`~~ — **DONE** commit `3bd245d7e`.
4. ~~**U6**: `resumeStuff`~~ — **DONE** commit `bc7f24961`. Y/N + Delete (Y/N/All) prompts. (rz `-r` flag passthrough for real ZMODEM resume is a follow-up — current behavior moves partial back to playpen, sender starts from beginning.)
5. **U7**: `internalCommandU` (`U` command) telnet/SSH — **DONE structurally** via existing UPLOAD_FILENAME_INPUT + UPLOAD_OKAY_CONFIRM substates + startBatchUploadTransfer → startZmodemUpload. Only blocked by BBSCmd `U.info` override on this site (points U to UL-Logoff door instead of internal). Code path works; activation is a site config decision.
6. ~~**U3**: `LVL_KEEP_UPLOAD_CREDIT`~~ — **DONE** commit `994aa7850`.
7. ~~**D14+U1, D15+U2**: udLog + session divider~~ — **DONE** commits `994aa7850` + `950938607`.

**P2 (next month)** — admin-only or unverified:
7. **D16+D17+D18+D20**: audit download checklist phase for Restricted/Free/ConfAccounting parity.
8. **U4**: verify `sysopULStats` writes both counters.
9. **U8**: `CREDITBYKB` toggle audit (low priority unless sysop wants it).
10. **U9**: mail-attach destination audit.

**P3 (defer)** — multi-node coordination, status-window refresh:
11. **U10**: `sendMasterUpload` cross-node lock — needs shared registry; rare scenario.
12. **D8**: status-window refresh — N/A on web/TS.

---

## Implementation pattern

The `runPostUpload` extraction (commit `6df5f7d7b`) is the template. For downloads:

1. New file `web/backend/src/services/post-download.service.ts` exporting `runPostDownload(emitter, session, ctx)`.
2. `PostDownloadContext = { downloadStartTime, downloadedFiles: number, downloadedBytes: number, perFileStats: Array<{file: FileEntry, sentBytes: number, isFree: boolean}>, goodbyeAfter?: boolean }`.
3. Body: emit "File transfer Completed.", stats line, per-file `updateDownloadStats`, top-CPS, callersLog, `dailyBytesDld`/`bytesADL` decrement (already inside `updateDownloadStats`), `displayULStats`, `pGoodbye` if requested, return to menu.
4. Wire from: lrzsz `onComplete` (download direction) in `transfer-misc-commands.handler.ts`, zmodem.js `onComplete`, and the batch-download HTTP-GET completion handler (frontend signals done via socket event).

---

## Out of scope

- Hydra protocol (we don't support it; the related reverse-upload pipeline is moot)
- External XPR libraries (FTP/HTTP/XPRZM as separate transport stacks)
- Localized number formatting differences
