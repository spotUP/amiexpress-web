---
date: 2026-05-18
topic: corpus-broken-doors-analysis
tags: [doors, overclock, corpus, bench]
status: final
---

# Corpus-broken doors — analysis (post-bench-overclock)

After `dev/scripts/bench-overclock.ts` (see `report-overclock.json`):

## Summary

| Bucket | Count |
|---|---|
| Total doors | 324 |
| Safe at 100000x | 294 |
| Cap at 25000x | 4 |
| Cap at 5000x | 0 |
| Cap at ≤1000x | 0 |
| Binary missing (corpus-broken) | 1 |
| Broken at every factor (pre-existing, not overclock-sensitive) | 25 |

## The 4 capped at 25000x

These cap *at* the new default — they run fine at 25000x, fail at higher.
Today's `DoorLifecycleManager` default bump (100x → 25000x) lands these at
their ceiling, no per-door override needed.

- `5d_logoff` — 5D-LogOff
- `5d_usr11_5d_user` — 5D-USR11 5D-User
- `tfa_bpxc_ganuaan` — TFA-BPXC GANUAAN.x
- `vty_cm11_meter` — VTY-CM11 Meter.020

If they ever start failing post-25000x bump, set
`OVERCLOCK=25000` in their `.info` tooltype to be explicit.

## The 25 broken at every factor

These fail at 100x, 500x, 1000x, 5000x, 25000x AND 100000x — pure
corpus brokenness, *not* an overclock-sensitivity issue. The new
default does NOT make them worse.

Suspected categories (informed by the names):

**Old commercial doors needing custom library setup** (most likely):
- `5d_zippysearch`, `5d_status`, `5d_status15`, `5d_logoff` (5th Dimension)
- `joe_topcall`, `joe_s_tl_topcall` (JOE Topcall family)
- `mth_ca10_kerocac` (MTH KeroCac)
- `rlx_move_move` (RLX MOVE)
- `aflwho10_afl_who10`, `aflfro11_afl_front11` (AFL family)
- `cal_bcon_bestconf` (CAL BestConf)
- `downmani_dm_extra` (DOWNMANI DM_Extra)
- `mst_who_mst_front_who` (MST Front+Who combo)
- `fd_amifront`, `fd_front_amifront` (FD! AmiFront)
- `crz_bt11_time` (CRZ Time)
- `x_frndor_front` (X-Front)

**Specific known-bad** (per memory `project_door_bug_backlog`):
- `masmd101_mastermind` — known-broken from earlier session investigation.
  Hardcoded "DEL" substring check at binary 0x562 — design bug, not
  emulator. Document, ignore.

**Likely scanner/listing utilities with assumptions about disk layout**:
- `nb_belchlist` (NB BelchLIST)
- `led_dcspeed` (LED DC_Speed)
- `killer_comment`, `klr_kcomment` (KiLLER Comment family)
- `warcalls` (WarCalls)
- `ihs_ul_logoff` (IHS Ul-Logoff)
- `zytes_bytes` (Zytes Bytes)
- `sent_fe` (Sent_FE)

**Missing binary** (not even broken at runtime):
- `fileid` (`FILEID (FID15CR)`) — `binaryExists: false`. Was already
  listed in archive but file isn't there. Curation bug.

## Recommendation

- **Don't try to fix these one at a time.** Each is 30+ minutes of
  68K disassembly to identify which Amiga assumption fails, and the
  ROI is low — these are obscure doors most BBSs don't deploy.
- **Add them to a corpus skiplist** so future bench / integration
  runs don't churn on them. Track in
  `dev/scripts/door-corpus/corpus.json` with a `skipReason: "..."`
  field.
- **Revisit if a user actually reports needing one.** Then the
  specific door's failure mode justifies the disassembly time.

## Re-run criteria

If we change emulator behavior (new syscall handler, library load,
filesystem assign resolution), re-run bench against just these 25
ids via:

```
cd web/backend
npx tsx ../../dev/scripts/bench-overclock.ts \
  --only sent_fe,5d_zippysearch,5d_status,... \
  --concurrency 1
```

Any door that starts working is a free win.
