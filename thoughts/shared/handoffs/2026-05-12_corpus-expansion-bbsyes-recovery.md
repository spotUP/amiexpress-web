---
date: 2026-05-12
topic: corpus-expansion-bbsyes-recovery
tags: [emulation, doors, corpus, cluster, bbsyes-recovery, session-handoff]
status: final
---

# Session handoff — 2026-05-12 (PM) — Corpus +3, BBSYES recovery, full bulk-probe finish

## Tasks worked on

Continuation of the 2026-05-12 AM door-coverage session. Three threads:

1. **Corpus expansion** — mined timeout-clusters.ts for 3 new cluster
   representatives, installed binaries, captured goldens, regression
   suite went from 38/38 → 41/41 green.
2. **`Commands/BBSYES/` recovery** — investigated + restored 135 .info
   files that had been moved out of `Commands/BBSCmd/` at 2026-05-12
   10:00:28 by an undocumented prior step. BBS now finds all commands
   again.
3. **Bulk-probe full sweep finished** — went from 2575 cached → 2985
   cached, 7023 binaries probed across 2985 archives.

## Recent changes (3 commits pushed in 3 chunks)

```
6958bb83f docs(door-testing): refresh count (36→41) + cross-link from 68K door guide
663413151 feat(door-corpus): +3 cluster representatives (PSY_LogOff, WarpSearch, AEHelp)
2bbd48274 [prior session handoff doc]
```

All 18 commits ahead of `c567a0117` pushed to `origin/main` in 3 chunks
(AREXX foundation / door tooling / this session expansion).

## Critical references

**Corpus additions** (each pins a cluster of 4-6 related doors):
- `psy_logoff` — Psychopath LogOff 1996, 5-door family (000/010/020/030/040
  CPU variants). Prompt `Do you want to leave mail to the sysop... (y/N)?`,
  send `n`. `Doors/PSY_LogOff/PSY_LogOff`.
- `warpsearch` — WarpSearch 2.5, 6-door family (+ TurboZ variants).
  Prompt `Enter string to search for:`, bare Enter exits. Second
  JH_LI line-input corpus door, distinct from 5D-ZippySearch.
  `Doors/WarpSearch/WarpSearch`.
- `aehelp` — AEHelp 0.4 by -=Nameless=-, 4-door family.
  Prompt `Enter command you want HELP with [press <RETURN> to quit]->`,
  bare Enter exits. Longer 8 s input delay because help screen takes
  time to render. `Doors/AEHelp/AEHelp`.

**Tooling unchanged** — see prior handoff
`thoughts/shared/handoffs/2026-05-12_door-coverage-corpus-probe.md` for
the full tool inventory (corpus, probe, bulk-probe, clusters,
coverage-report). Doc cross-link added at
`Documentation/4-Door-Developers/68K_DOOR_DEVELOPMENT.md:108` so 68K
door authors discover the testing tooling.

**Recovery backup branch** — `backup-2026-05-12-bbsyes-investigation`
(safety net; can be deleted in a few sessions once we're sure).

## Final bulk-probe state

- Archives scanned: **2985** (effectively all 3143 — remaining ~158
  archives produced zero usable binaries: cracktro/intro-only LHAs, etc.)
- Door binaries probed: **7023**
- Clean exit: **4334** (61.7%)
- Blocked by missing LVO: **0** — zero hard blockers
- Timed out on interactive prompts: **2684** — expected, await input
- Remaining stub LVOs across all 7023 binaries: **7** stubs total across
  ~14 doors (SendIO ×4, SetFileSize ×4, AllocTrap/FreeTrap ×2 each,
  AddResource ×2, StartNotify ×1, SumLibrary ×1). All rare/edge.

Cache lives at `/tmp/bp-full/results/` — re-run `npm run coverage:report`
or `npm run clusters:report` anytime.

## Learnings

- **`Commands/BBSCmd/cs.info` had been deleted from the worktree before
  this session** — caused the first corpus run to regress (golden 1581B
  vs got 765B on confscan). Restored via `git checkout HEAD --`. Trigger
  unknown but predates this session.
- **A larger BBSCmd → BBSYES bulk move happened at 2026-05-12 10:00:28**
  — undocumented, no git history, no code references to "BBSYES".
  135 of 137 BBSYES files were byte-identical to HEAD's BBSCmd version
  (no edits to preserve). 8 were novel: `nuke.info`, `L.info`,
  `KICKBOX.info.backup`, and 5× `*.backup-aquascan000` (the last 7 are
  gitignored runtime backups; `L.info` is the only genuinely
  untracked-new entry — a door at `doors:scan.x`). Restored cleanly,
  zero data loss. **Future:** if "BBSYES" reappears, the recovery
  pattern is documented above.
- **NewChat door (chat3.4 cluster) dropped from corpus candidate list**
  — its `press <RETURN> to continue` prompt is preceded by a user-list
  redraw loop. Output grows over time (1703B → 3327B at 20 s timeout)
  — fundamentally non-deterministic like 5D-Clock. Treat all
  "users in chat" status doors with caution before adding to corpus.
- **No archives found** for 5 cluster reps we wanted (QuickAnsi,
  GoodBye, MasterView, GetAnswer, ListSpeeder). The
  `amiexpress_doors/Archives/` corpus is sized but not exhaustive;
  next batch of expansion should source these from external trackers.

## Artifacts

- Corpus manifest: `dev/scripts/door-corpus/corpus.json` (41 doors)
- New goldens:
  - `dev/scripts/door-corpus/goldens/psy_logoff/`
  - `dev/scripts/door-corpus/goldens/warpsearch/`
  - `dev/scripts/door-corpus/goldens/aehelp/`
- Final cov + clusters reports (latest cache):
  - `/tmp/cov-final.md`
  - `/tmp/clusters-final.md`
- Bulk-probe log: `/tmp/bp-resume2.log` (resume run)
- Backup branch: `backup-2026-05-12-bbsyes-investigation`

## Next steps (ordered)

1. **Source missing cluster reps** (QuickAnsi, GoodBye, MasterView,
   GetAnswer, ListSpeeder) from external archives. Each adds 4-7 doors
   of cluster-bound regression coverage in one corpus entry.
2. **Address the 7 remaining stub LVOs** if/when a door surfaces that
   actually needs them — AllocTrap/FreeTrap show 84 408 calls each
   across 2 doors, suggesting one tight-loop user. Probe those two
   binaries to identify.
3. **Delete the backup branch** (`backup-2026-05-12-bbsyes-investigation`)
   in a few sessions once we're sure the recovery stuck.
4. **Investigate the still-deferred native AREXX engine OOM** — worked
   around via `AREXX_ENGINE=ts`. See prior handoff.

## Other notes

- **System clean.** Bulk-probe finished. No background procs running.
  Working tree clean except for runtime mutation (Conf.DB, Bulletins,
  logs) and the genuinely-new `Commands/BBSCmd/L.info`.
- **`origin/main` at `6958bb83f`** — fully synced. Hetzner deployed 3×
  during the chunked push.
- The cluster report still surfaces `5D^QuickAnsi` (7 doors), `chat3.4`
  family (7 doors), `WarCalls` (5 doors), `wall` (5 doors), and a few
  others as next high-leverage targets — all need archive sourcing
  or scripted-input variants we haven't tried yet.
