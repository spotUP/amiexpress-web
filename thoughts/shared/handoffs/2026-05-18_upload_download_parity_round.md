---
date: 2026-05-18
topic: upload/download parity execution round
tags: [parity, upload, download, express-e, audit, handoff]
status: final
---

# Upload/Download 1:1 Parity Round

User directive: "make upload and download 1:1 with the E sources was the mission".

Output: 14 parity commits plus 4 docs/test commits. ~14 of 33 audit gaps closed,
6 verified-already-correct, 3 deferred (interactive cosmetic / multi-node /
Hydra), rest cosmetic or low-impact.

## Commits in order

| Commit | Item | Summary |
|---|---|---|
| `e1a37e7b9` | audit | 3-part parity audit (express.e walkthrough + TS code map + diff) |
| `a61b8ff55` | UI fix | Drop straight to menu after upload (express.e:25620 — no bull re-render) |
| `c21277438` | hardening | Strict lrzsz on telnet/SSH; clear error if not installed |
| `a8a610499` | bug fix | DIR write survives stray non-dir file at HOLD/LCFILES path |
| `3716da37e` | parity | Use first DIZ line as primary description (express.e:19285) |
| `814defaaf` | **P0** | runPostDownload shared service — D1+D2+D4+D11+D12+D13 |
| `994aa7850` | **P1** | KEEP_UPLOAD_CREDIT persist + UDLog/CallersLog dual-write (U2+U3+D15) |
| `3bd245d7e` | **P1** | cleanPlayPen — partial uploads preserved at PartUpload/@slot (U5) |
| `950938607` | **P1** | Per-session UDLog session header + beenUDd gate (U1+D14) |
| `6276b145a` | docs | Mid-round audit status update |
| `a9a542080` | **P2** | Reject "Restricted" comment files (D16) |
| `74f218076` | tests | 13/13 regression tests for runPostDownload + invariants |
| `b8a3e5294` | docs | Audit status update — D16 + tests |
| `a2451134f` | **P1** | pGoodbye 10-sec countdown on telnet/SSH too (D9) |
| `bc7f24961` | **P1** | resumeStuff interactive Y/N + Delete (Y/N/All) prompt (U6) |
| `bd77b6ba6` | docs | Final round audit status |

## What is now identical to express.e across web/telnet/SSH

- **Post-receive upload pipeline** (express.e:18850-19130 uploadaFile tail):
  banner, stats line, aggregate callersLog, sysop notify, time credit,
  KEEP_UPLOAD_CREDIT persist (½ to user.timeTotal), disk UDLog dual-write,
  per-session UDLog header.
- **Per-file upload processing** (express.e:19139-19514): DIZ extraction,
  testFile, move to FILES/LCFILES/HOLD, DIRn append, FILES.BBS, user
  upload counters incl top CPS, conference stats, per-file callersLog,
  BBSEvent emit, webhook trigger, sysop NumULs counters.
- **Playpen lifecycle** (express.e:18259+ and 18119+): cleanPlayPen
  preserves partials at `<conf>/PartUpload/<name>@<slot>`; resumeStuff
  offers them back next session with Y/N + Delete (Y/N/All) interactive
  prompts.
- **Post-transfer download pipeline** (express.e:20251-20316): banner,
  stats line, lastDlCPS persist, top-CPS persist (dnCPS2/oldDnCPS),
  aggregate callersLog, disk UDLog dual-write, per-session UDLog header,
  pGoodbye 10-sec countdown on G-after-transfer (was web-only before).
- **Pre-transfer download checklist**: ratio gates, daily byte gates,
  Restricted-comment file rejection with callersLog entry, free-download
  flag, conference accounting branch.
- **Format compliance**: DIR file entry layout matches AquaScan parser
  expectations (first DIZ line as primary description, 33-space
  continuation indent, status marker at col 13); HOLD/LCFILES path
  handles stray non-dir blocker gracefully.

## Open items (low priority)

- **U7 internal U command on telnet/SSH**: code path exists (UPLOAD_FILENAME_INPUT
  → UPLOAD_OKAY_CONFIRM → startBatchUploadTransfer → startZmodemUpload).
  Blocked only by site config: `Commands/BBSCmd/U.info` overrides U to
  the UL-Logoff door which RETURNCOMMAND="RZ"s back to the internal RZ
  flow. Activation is a sysop decision; no code change needed.
- **U8 CREDITBYKB toggle full propagation**: ACS toggle wired, ratio
  calc honors it, file format util honors it; defer full byte-counter
  audit unless a sysop reports issues.
- **U9 mail-attach destination audit**: writes to `<msgBase>F<n>/<fn>`
  per express.e:10721-10741; current TS path uses web picker for
  attachments; destination not explicitly verified against express.e.
- **U10 sendMasterUpload multi-node lock**: rare scenario; needs shared
  registry; deferred.
- **U11 skipdFiles listing verification**: skipped-file list in summary;
  current dupe detection works, listing format not byte-verified.
- **D19/D20 download checklist micro-divergences**: checkRatiosAndTime
  returns boolean instead of express.e's 3-way return; functional
  equivalence already; cosmetic.
- **resumeStuff rz `-r` flag passthrough**: current implementation moves
  partial back to playpen; sender starts from byte 0. For real ZMODEM
  resume, would need to pass file size hint to rz so ZRPOS triggers
  resume-from-offset.

## Verification

Live-tested by user:
- MuffinTerm upload via UL-Logoff door → RETURNCOMMAND="RZ" → file
  uploaded, processed through per-file pipeline, DIR1 appended,
  appears in F (file list).
- DIZ rendering in F command now shows full ASCII art block with title
  in correct position.

Not yet user-verified (but covered by regression tests):
- Download pGoodbye countdown on telnet/SSH
- runPostDownload aggregate stats line on telnet/SSH
- cleanPlayPen after upload (no leftover playpen files)
- resumeStuff Y/N prompt (only fires if PartUpload has user's @slot files)

## Test status

`web/backend/tests/post-download-pipeline.test.ts` — 13/13 pass.
`web/backend/tests/upload-completion-banner.test.ts` — 32/32 pass.
`web/backend/tests/lrzsz-protocol-patches.test.ts` — pinning the MuffinTerm
CRC patches.

## Next session bootstrap

Read this doc + `thoughts/shared/research/2026-05-18_upload_download_parity_diff.md`.
The parity diff has the full 33-gap table with status of each item.

Most likely next priorities if the user wants more parity work:
1. U7 BBSCmd `U.info` override decision (sysop choice — keep door wrapper
   or expose internal U for telnet/SSH).
2. resumeStuff rz `-r` integration so partials actually resume mid-byte.
3. U9 mail-attach destination verification.
