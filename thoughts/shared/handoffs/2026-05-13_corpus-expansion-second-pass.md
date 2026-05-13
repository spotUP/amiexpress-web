---
date: 2026-05-13
topic: corpus-expansion-second-pass
tags: [emulation, doors, corpus, cluster, jh_li, multi-input, bbsyes-recovery, session-handoff]
status: final
---

# Session handoff — 2026-05-12/13 — Corpus expansion second pass (38 → 62)

## Tasks worked on

Continuation of the 2026-05-12 AM "100% door coverage" arc. Three threads:

1. **Corpus expansion** — +24 cluster representatives across multiple
   probe-mining rounds, from 38 → 62 doors green.
2. **`Commands/BBSCmd → BBSYES` recovery** — 135 .info files had been
   moved at 2026-05-12 10:00:28 by an undocumented prior step;
   restored cleanly with no data loss. Backup branch left as safety.
3. **Bulk-probe full sweep finish + universe coverage report** — 2985
   archives / 7023 binaries / 4334 clean exits (61.7%) / 0 hard LVO
   blockers / 7 rare stubs across 14 doors.

User mandate this session: "make doors work" — same as the AM
session. Net result: from 38 corpus → 62 corpus, **~155 binaries'
worth of cluster regression coverage in CI**.

## Final state

- `origin/main` at `b700af98e` — fully synced (SSH).
- Corpus 62/62 green (verified serial; parallel runs flake under load).
- Background procs 0.
- Working tree clean except for runtime mutation (Conf.DB, Bulletins,
  logs) and `Commands/BBSCmd/L.info` (genuinely-new untracked door entry
  pointing at `doors:scan.x` — orphan from a prior session).

## Recent commits (8 pushed this session)

```
b700af98e feat(door-corpus): +1 cluster rep (G - AFL logoff helper)
74747f7f1 feat(door-corpus): +3 cluster reps (Comment2, dCN!SENT, 5D-Wall)
df4353dc2 feat(door-corpus): +5 cluster reps (5D-LogOff, FileDescription, cOLORWALL, SmartDSF, d-lOSt_bULLs)
7914431ee feat(door-corpus): +4 cluster reps (ByteComment, wall.020, edit.020, CD_DL)
5367a25c0 feat(door-corpus): +1 cluster rep (FILEID, 7-door family)
c737f2faf feat(door-corpus): +1 multi-input cluster rep (WarCalls)
9187926b2 feat(door-corpus): +1 cluster rep (QuickLogon)
1efcaf603 feat(door-corpus): +5 cluster reps from the dir we have
1d31a2e8f docs: session handoff — corpus +3, BBSYES recovery, bulk-probe finish
6958bb83f docs(door-testing): refresh count (36→41) + cross-link from 68K door guide
663413151 feat(door-corpus): +3 cluster representatives (PSY_LogOff, WarpSearch, AEHelp)
```

## Critical references

**The 24 new corpus entries** (each pins a 3-8 door cluster):

| id | source archive | family size | input | notes |
|----|----------------|---|---|---|
| `psy_logoff` | `PSY_LOG.LHA` | 5 | `n` | y/N logoff |
| `warpsearch` | `WARPS_25.LHA` | 6 | `\r` | JH_LI search |
| `aehelp` | `AEHELP04.LHA` | 4 | `\r` (8s) | help index |
| `quickansi` | `5D-QA005.LHA` | 7 | `\r` | `Choose : ->` |
| `listspeeder` | `AQLSPD12.LHA` | 4 | `\r` | bare `>` line-input |
| `goodbye` | `DPL_GB11.LHA` | 4 | `n` | logoff y/N |
| `masterview` | `DPL_MA10.LHA` | 4 | `\r` | file-view line-input |
| `getanswer` | `HCD-GA10.LHA` | 4 | `\r` | handle/usernr |
| `quicklogon` | `H&V-QL10.LHA` | 6 | `n` | quick-logon y/N |
| `warcalls` | `H&V-WC11.LHA` | 5 | `\r`+`n`+`n` | **3-stage multi-input** |
| `fileid` | `FID15CR.LHA` | 7 | `\r` | error-exit path |
| `byte_comment` | `OPS-BC10.LHA` | 5 | `\r` | filename line-input |
| `mst_wall` | `MST-WALL.LHA` | 5 | `n` | wall y/n (distinct from wall-mst) |
| `mst_edit` | `MST-EDIT.LHA` | 5 | `\r` | edit filename |
| `cd_dl` | `CD-DL.LHA` | 5 | `\r` | `Filename(NN):` |
| `5d_logoff` | `5D-LO014.LHA` | 4 | `\r` | banner-heavy logoff |
| `file_description` | `FDESCR11.LHA` | 4 | `\r` | configfile error path |
| `color_wall` | `AFL-CW13.LHA` | 4 | `\r` | `[KEY] TO CONTINUE !` |
| `smart_dsf` | `INS-SD13.LHA` | 4 | `\r` | sysop-tagging notice |
| `d_lost_bulls` | `HNY-LB02.LHA` | 4 | `\r` | bulletin selector |
| `comment2_afl` | `AFL_PACK.LHA` | 3 | `\r` | comment banner |
| `dcn_sent` | `DCN!F-X2.LHA` | 4 | `n` | STRIP_ID y/N |
| `5d_wall` | `5D-WA125.LHA` | 3 | `\r` | Joyride wall banner |
| `afl_g_logoff` | `AFL_PACK.LHA` | 3 | `n\r` | **second JH_LI multi-byte** |

**Tooling unchanged** — see prior handoff
`thoughts/shared/handoffs/2026-05-12_door-coverage-corpus-probe.md`.

**Backup branch** — `backup-2026-05-12-bbsyes-investigation` still
exists; safe to delete in a future session.

## Learnings

- **Multi-input scripts work.** WarCalls (3 inputs over 7.5 s) and G
  (single `n\r` line-input) prove the harness handles chained
  scripted inputs across JH_PM/JH_HK/JH_LI without bugs. Earlier
  diagnosis that "WarCalls ignores scripted input" was wrong — it
  needed 3 inputs not 1. JH_LI line-input requires CR to terminate
  (a single `n` byte alone never completes the line).
- **JH_PM vs JH_HK vs JH_LI all use different reply paths.** Probe
  output shows the door's actual XIM ops, so you can tell which
  input scheme to use:
  - `JH_HK (Hotkey)` → 1 char, no CR needed.
  - `JH_PM (Prompt Message)` → line input, terminated by CR.
  - `JH_LI (Line Input)` → also line input, also terminated by CR.
  Both `n` and `n\r` work for JH_HK but only `n\r` works for JH_LI/JH_PM.
- **Probe parallel runs flake under load.** Per-door 30 s timeout
  isn't enough when 4+ probes share the same emulator subsystem.
  **Run corpus with `--concurrency 1`** for any production-CI verify
  — slower (5-6 min vs 1.5 min) but rock-solid. Parallel mode is fine
  for capture (one door at a time anyway) but flaky for batch verify.
- **The `Commands/BBSCmd → BBSYES` rename** at 2026-05-12 10:00:28
  AM was undocumented (no commit, no handoff). 129 of 137 BBSYES
  files were byte-identical to HEAD's `BBSCmd/` — the rest were
  novel (one new `L.info` for a `doors:scan.x` door + 7 gitignored
  `.backup-*` files). Recovery pattern: `git checkout HEAD --
  Commands/BBSCmd/`, then `cp BBSYES/* BBSCmd/` for the novel files,
  `rmdir BBSYES`. Zero edits to preserve, zero data loss.
- **`/tmp/ram/ENV/` must exist** for the emulator to write
  `STATS@<nodeId>` files; without it doors timeout with 0 bytes
  stdout. The codepath (`initializeENVFiles → fs.mkdirSync recursive`
  at env-initializer.ts:31-33) already handles missing dir, so
  `rm -rf /tmp/ram/*` is recoverable on next probe. But if probes
  run mid-cleanup the in-flight ones return empty. Never delete
  `/tmp/ram` contents while any door probe is queued.
- **Five 3+-door clusters are intentionally deferred:**
  - `aehydra` (6 doors) — needs full `.info` install for
    icon.library GetDiskObject.
  - `MDB-ConfUpdater` (8) — menu renders but Q selection doesn't
    dispatch. Likely line-input vs hotkey routing bug.
  - `chat3.4` / `newchat` / `THCChatter` (multi-user chat, 8+4) —
    non-deterministic user-list redraws.
  - `AutoReward` (4) — forks background upload-check, never exits.
  - `Hststat` / `Pwfail` (3+3) — JH_LI line-input but flaky in
    batch under contention; isolated probes also fail intermittently.
- **The "binary not found" trap.** When you `cd` into a subdir for a
  cluster install and then run `npm --prefix web/backend run probe --`,
  the harness resolves paths from the npm script's `cd ../..` jump,
  i.e. project root. If your cwd at `cp` time was a tmp dir, your
  Doors/ files landed at `/tmp/.../Doors/<Name>/` instead of the
  repo's `Doors/<Name>/`. Always do install operations from the
  project root.

## Artifacts

- Final cov + clusters reports (cached at session end):
  - `/tmp/cov-final.md` (95 lines)
  - `/tmp/clusters-final.md` (40 lines)
- Bulk-probe cache: `/tmp/bp-full/results/` (2985 archives)
- Cluster install staging: `/tmp/cluster-installs/`, `/tmp/cluster-installs2/`
- Corpus manifest: `dev/scripts/door-corpus/corpus.json` (62 doors)
- Backup branch: `backup-2026-05-12-bbsyes-investigation`
- Prior handoffs:
  - `thoughts/shared/handoffs/2026-05-12_door-coverage-corpus-probe.md` (AM session, foundational tools)
  - `thoughts/shared/handoffs/2026-05-12_corpus-expansion-bbsyes-recovery.md` (PM session, first +3 corpus + BBSYES doc)

## Next steps (ordered)

1. **Address the 5 deferred clusters** — each needs different work:
   - aehydra: install full `.info` config + RamDISK
     `Doors:AEHydra/AEHydra.cfg` setup.
   - MDB-ConfUpdater: investigate input routing — does its
     `Please make your selection:` prompt use JH_LI or JH_HK? Probe
     log will show. If JH_LI, send `Q\r`. If JH_HK, single `Q` should
     work — find why it isn't.
   - chat doors: implement deterministic snapshot for user-list
     redraw (skip timestamps + node-count fields per existing
     time-mask diff pattern).
   - AutoReward: kill background task in the probe harness via a
     scripted `EOF` or SIGTERM after N seconds; capture pre-fork
     trace as the golden.
   - Hststat/Pwfail: figure out why JH_LI line-input flakes in
     batch even with concurrency=1. May be the JH_LI completion
     race in `io.ts:queueInput()`.
2. **Switch corpus runner default to concurrency=1**, or auto-detect
   system load and back off. Currently `--concurrency 4` is the
   default but it flakes; users (CI included) get a worse experience
   than necessary.
3. **Delete the backup branch** `backup-2026-05-12-bbsyes-investigation`
   in a few sessions once we're sure the recovery stuck.
4. **Investigate the still-deferred native AREXX engine OOM** —
   worked around via `AREXX_ENGINE=ts`. See AM handoff.
5. **Push credential note.** Today's session hit a 403 on git push
   because the macOS keychain had a `johanBMS`-account GitHub token
   stored under the `spotUP` username label. Resolved by switching
   the remote URL to SSH (`git remote set-url origin
   git@github.com:spotUP/amiexpress-web.git`). If you switch back to
   HTTPS later, generate a fresh PAT from the spotUP GitHub account.

## Other notes

- **62/62 verified serial** at end of session. Always re-verify
  with `npx tsx dev/scripts/door-corpus/run.ts --concurrency 1`
  before pushing.
- **`L.info` in `Commands/BBSCmd/`** is untracked — points at
  `doors:scan.x` which is also untracked at the repo root. Looks
  like a half-finished install from a prior session. Either install
  + commit, or delete both. I left it alone.
- **`/tmp/ram/ENV` is fragile**. Several runtime files (`STATS@N`,
  `JC_PWFAIL.N`, BBS-name files) live there. Don't `rm -rf /tmp/ram`
  while probes are queued — recovery is automatic on next probe but
  the in-flight ones return empty.
- **Diminishing returns ahead.** Remaining clusters are either deferred
  (need real config/install work) or sub-3-door (low pinning value).
  The 62-door corpus already covers ~155+ distinct binaries' worth of
  cluster-bound regression coverage. The next high-leverage thread is
  not "+1 more corpus entry" — it's tackling one of the deferred
  clusters' root cause (especially MDB-ConfUpdater's Q dispatch and
  the JH_LI flake, both of which would unlock multiple clusters at
  once).

## Quick reset for the next session

```
cd /Users/spot/Code/amiexpress-web
git status                                            # expect mostly clean
git log --oneline 663413151..HEAD                     # 8 commits this session
npx tsx dev/scripts/door-corpus/run.ts --concurrency 1  # verify 62/62
npm --prefix web/backend run coverage:report          # universe state
npm --prefix web/backend run clusters:report -- --top 30 --min 3  # remaining
```
