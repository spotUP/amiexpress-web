---
date: 2026-05-18
topic: zmodem-muffinterm-upload-unification
tags: [zmodem, lrzsz, muffinterm, telnet, ssh, web, upload, unification]
status: final
---

# ZMODEM MuffinTerm interop + upload pipeline unification

## Task(s)

1. Fix MuffinTerm telnet uploads (failing with `ZNAK` retry loop, then `ZCAN`).
2. Fix "31 files, 1032k bytes" wrong stats after upload (only 1 file actually uploaded).
3. Unify the post-upload pipeline across web / telnet / SSH so no logic is duplicated. Per user: "web is the source of truth for all".

## Critical references

- `web/backend/src/services/lrzsz-transfer.service.ts` — child-process wrapper around lrzsz `sz`/`rz`. Now owns three protocol patches and snapshot-based file diff.
- `web/backend/src/services/post-upload.service.ts` — **NEW**. Shared `runPostUpload()` — completion banner, stats, callersLog, sysop notify, time credit, goodbye-after handling. Extracted verbatim from web's `handleUploadBatchComplete`.
- `web/backend/src/server/file-socket-handlers.ts:770` — `handleUploadBatchComplete` is now a thin wrapper that calls `runPostUpload`. `processBatchFile` (line 264) is unchanged — still the per-file pipeline.
- `web/backend/src/handlers/commands/transfer-misc-commands.handler.ts:138-246` — telnet/SSH RZ command's lrzsz `onComplete` now synthesizes an uploadContext, loops `processBatchFile` per received file, then auto-completes via `handleUploadBatchComplete`. **Same code path as web**.
- `web/backend/src/handlers/commands/transfer-misc-commands.handler.ts:265-301` — fallback ZmodemTransferManager `onComplete` (used when lrzsz unavailable + for web's RZ entry point) also routes through `runPostUpload`.
- `tests/upload-completion-banner.test.ts` — refreshed for `post-upload.service.ts`, plus duplication-detection tests for both handlers.
- `tests/lrzsz-protocol-patches.test.ts` — **NEW**. Pins ZRINIT CANFC32 clear, ZCRCE→ZCRCW rewrite, and snapshot-diff file counting.
- `express.e:18944` `uploadaFile()` — authoritative spec for upload flow. Post-receive block: 18850-19130.

## Recent changes

### 1. MuffinTerm CRC interop (lrzsz-transfer.service.ts)

Two surgical patches in the lrzsz I/O wrapper:

**Outbound — ZRINIT CANFC32 clear (`patchZrinitFlags`).** rz advertises `CANFC32` (0x20) in its ZRINIT but then incorrectly rejects ZBIN/CRC16 subpackets sent by clients that don't opt into CRC32 (MuffinTerm in particular). Forces sender to negotiate CRC16-only. Byte rewrite:
- Original on wire: `2a 2a 18 42 30 31 30 30 30 30 30 30 32 33 62 65 35 30` (`**\x18B0100000023be50`)
- Patched:        `2a 2a 18 42 30 31 30 30 30 30 30 30 30 33 39 61 33 32` (`**\x18B01000000039a32`)
- New CRC `0x9a32` verified offline against lrzsz's own `updcrc` table.

**Inbound — ZFILE subpacket ZCRCE→ZCRCW (`rewriteMuffintermZfile`).** MuffinTerm terminates the ZFILE name/info subpacket with `ZCRCE` (0x68 = "frame ends"). Per Forsberg the correct marker is `ZCRCW` (0x6b = "ZACK expected"), since the sender must wait for the receiver's ZRPOS before sending data. lrzsz rejects ZCRCE for ZFILE as a protocol violation. The rewriter:
- Detects ZBIN ZFILE prefix `2a 18 41 18 44`
- Scans for ZDLE+ZCRCE terminator `18 68`
- Rewrites marker byte to `0x6b`
- Recomputes CRC16 over `data + 0x6b` using standard CCITT (poly 0x1021, init 0) — verified matches lrzsz's `updcrc` zero-result check
- Handles fragmented chunks via `inboundBuf`
- Only fires for upload direction (download never sees ZFILE inbound)

### 2. File-count fix (lrzsz-transfer.service.ts)

`finish()` previously did `received = fs.readdirSync(cwd).map(...)`, which returned every file in the playpen including stragglers from prior failed sessions — that's the "31 files, 1032k" symptom. Now:
- `start()` snapshots `preTransferFiles: Set<string>` from `readdirSync(cwd)`
- `finish()` filters `readdirSync(cwd)` by `!preTransferFiles.has(name)`
- Only files newly created by THIS rz session count as "received"

### 3. Shared post-upload pipeline (post-upload.service.ts + 3 callers)

`runPostUpload(emitter, session, ctx)` does the post-receive work that previously lived inline in web's `handleUploadBatchComplete`:
- "File Uploading Complete..." banner
- Stats line `N file(s), Yk bytes, Mm Ss, X cps, Z% efficiency`
- callersLog entry (success line if `uploadedFiles > 0`, else "Upload Failed..")
- `doUploadNotify` (sysop notify + EXECUTE_ON_UPLOAD, gated on `uploadedFiles > 0`)
- Time credit `peff = (ulTTTM * 3 / 2) + 60` seconds
- `session.timeLimit += peff`
- "Time increased by N mins." emit
- `onCleanup()` (web passes `clearUploadContext`; telnet/SSH pass nothing)
- Goodbye-after-transfer → `handleGoodbyeCommand`
- Otherwise: "Press any key to continue..." + `subState = DISPLAY_CONF_BULL`

Three callers, zero duplication:
- `handleUploadBatchComplete` (web) — body reduced from ~80 lines to a single delegating call.
- lrzsz `onComplete` (telnet/SSH RZ command) — loops `processBatchFile` per file, then `handleUploadBatchComplete` auto-completes via its own `runPostUpload`.
- zmodem.js `onComplete` (fallback for missing lrzsz; also used by web RZ entry) — calls `runPostUpload` directly with snapshot-counted files.

### 4. Per-file processing (transfer-misc-commands.handler.ts onComplete)

Telnet/SSH lrzsz now drives the SAME per-file pipeline as web:
- DIZ extraction
- File integrity test (`testFile`)
- Move from playpen to FILES/LCFILES based on test result
- DIRn append
- FILES.BBS write
- User upload counters (`uploads`, `bytesUpload`, top CPS)
- Per-conference stats
- Per-file `callersLog`
- BBSEvent emit (for LiveChat)
- Webhook trigger

Implementation: synthesize the `uploadContext` shape that web's file picker normally builds (uploadMode=true, fileArea looked up via `db.getFileAreas(session.currentConf)[0]`, uploadBatch pre-populated with placeholder entries per received file), then call `processBatchFile` in a loop. The pre-populated batch is **load-bearing** — empty `uploadBatch` would make `processBatchFile` think every file is "the last" and auto-complete on iteration 1, clearing `tempData` and breaking subsequent files with "Upload session lost".

## Learnings

- **MuffinTerm has two real protocol bugs** (CRC32 over ZBIN frames, and ZCRCE-instead-of-ZCRCW termination). Both are observable with `socat -x` capture between client and BBS. SyncTerm doesn't trip either because it uses ZBIN32 + ZCRCW.
- **lrzsz's `updcrc` is non-standard CCITT** but verifies the same set of valid CRCs as standard bitwise CCITT (poly 0x1021, init 0). Both algorithms produce the same trailer bytes for the same input; only intermediate running-CRC values differ. Confirmed by feeding identical inputs through both formulations side-by-side.
- **"Bad CRC" in lrzsz stderr is misleading** — it can mean wrong subpacket terminator type (e.g. expected ZCRCW, got ZCRCE), not actually a CRC mismatch. Run `rz -vvvv` to see `zrdata: N ZCRCE` immediately before the `Bad CRC` line — that's the giveaway.
- **`processBatchFile` auto-completes via `handleUploadBatchComplete` when it thinks it's the last file** (line 723-728). It's driven by `uploadBatch.length`, so any caller that synthesizes an empty batch will see every iteration treated as the last. Pre-populate with placeholders.
- **The telnet/SSH emitter wrapper is structurally compatible with `Socket`** for the methods upload handlers use (`emit`, `id`, `connected`). Wrapper drops non-output events (`set-input-mode`, `show-file-upload`) silently — fine for the batch-upload path which doesn't depend on them.
- **Cardinal rule paid off**: writing the regression test for "30 of 32 pass" surfaced that I'd left a second `onComplete` (the zmodem.js fallback) with duplicated stats. Refactored that too.

## Artifacts

- New: `web/backend/src/services/post-upload.service.ts`
- New: `web/backend/tests/lrzsz-protocol-patches.test.ts`
- Modified: `web/backend/src/services/lrzsz-transfer.service.ts`
- Modified: `web/backend/src/server/file-socket-handlers.ts` (handleUploadBatchComplete → thin wrapper)
- Modified: `web/backend/src/handlers/commands/transfer-misc-commands.handler.ts` (both onCompletes unified)
- Updated: `web/backend/tests/upload-completion-banner.test.ts`

Verified live: MuffinTerm upload of `_U_MBM10.LHA` succeeded (`Transfer complete`, exit code 0) — see `logs/backend.log` around `00:39` `2026-05-18` for the captured exchange.

## Next steps

1. **Verify with user**: have them retry both telnet/SSH MuffinTerm upload AND web upload. The telnet path should now show proper completion (correct file count, "Testing... <file>" per file, callersLog, time credit). Web should still behave exactly as before since `handleUploadBatchComplete` is byte-equivalent via the shared service.
2. **Investigate "web upload drops to menu"** reported by user pre-handoff. No reproducer captured in this session. Likely candidate: `getUploadContext` fallback chain failing — `session.tempData` may be cleared by something between file-picker open and `file-uploaded` event.
3. **The user said "F (flag) double-flags files"** (open task #14, separate issue, not investigated this session).
4. **Consider extracting per-file processing logic** out of `processBatchFile` into a transport-neutral `processReceivedFile()` helper. Right now telnet/SSH gets per-file processing by piggybacking on the synthetic-uploadContext trick — works, but couples lrzsz onComplete to the web upload context shape. A cleaner extraction would make `processBatchFile`'s parameter set explicit instead of pulling from `uploadContext`.
5. **MuffinTerm bug report upstream**: ZCRCE-instead-of-ZCRCW for the ZFILE name subpacket is the root-cause fix. Our gateway patches around it; the proper fix lives in MuffinTerm.

## Other notes

- Stop `socat` proxy on `:64129` if no longer needed: `pkill -f "socat.*64129"`.
- Stdin tee files at `/tmp/rz-stdin-tee-{upload,download}.bin` are diagnostic — left in place for next debugging round, gitignored.
- BBS backend in watch mode picked up all the service changes without manual restart.
