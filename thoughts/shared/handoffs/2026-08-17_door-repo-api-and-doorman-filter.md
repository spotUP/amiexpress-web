---
date: 2026-08-17
topic: Central door-repo API shipped live; DOORMAN filter arc closed; consumer side awaiting final re-review + push
tags: [handoff, door-repo, api, doorman, sdd, caddy, 68k]
status: final
---

# Session handoff — 2026-08-17 — door-repo API + DOORMAN filter arc

Two bodies of work. The first is DONE and user-confirmed. The second is
complete-but-unpushed, waiting on one re-review.

## HOW TO RESUME (exact)

1. `git -C /Users/spot/Code/amiexpress-web log --oneline origin/main..HEAD`
   — 15 unpushed commits at handoff time (list at the bottom of this doc).
2. SDD ledger, source of truth for the door-repo plan:
   `.superpowers/sdd/2026-08-17-door-repo-api/progress.md` — every task
   verdict, every controller ruling, every deferred minor.
3. Check whether the last dispatched agent finished: it was handling **I5**
   (gate the API mount to owner role) and **I6** (apply `oneLine()` to
   `name`/`archiveName` in `list.txt`) in `web/backend/src`. Look for a
   commit after `fc035ffd2` and a follow-up section in
   `.superpowers/sdd/2026-08-17-door-repo-api/final-fix-perf-report.md`.
4. Then: scoped re-review of the whole final-fix set (C1, C2, I4, I5, I6),
   then push, then the sequencing step in "BEFORE THE NEXT DEPLOY" below.

## BEFORE THE NEXT DEPLOY — do not skip

Once I5 (mount gating) lands, the **production host must have
`DOOR_REPO_ROLE=owner` in its `.env.local`** or the live API goes dark
(the router will not mount). The compose pass-through already landed
(`d12ff25d9`, `feee74927`); the host-side line has NOT been set yet.
Host: `root@89.167.21.154`, stack at `/app/amiexpress/`. After deploying,
verify: `curl -s http://bbs.uprough.net/api/door-repo/health` → 200 JSON.

## Part 1 — Central door-repo API (LIVE, verified)

Read-only HTTP API so any amiexpress-web BBS *and real 68K AmiExpress*
can browse/install from one central catalog. Owner curates via git; there
are no write endpoints at all.

- Live now over **plain HTTP** (classic Amiga TCP stacks cannot do TLS):
  `http://bbs.uprough.net/api/door-repo/{manifest,list.txt,archive/<name>,health}`
- Verified end-to-end by the controller: health returns
  `{status, revision, doors:3301}`; `list.txt` header + CRLF confirmed in
  raw `od` output; a downloaded archive's md5 matched its `X-Archive-Md5`.
- Plain HTTP works because of a **host-side Caddy exemption applied
  2026-08-17** — `/etc/caddy/Caddyfile`, backup
  `Caddyfile.bak-doorrepo-20260817-102750`. That file is NOT managed by
  deploys; `deploy/README.md` is its only in-repo record. The `http://`
  block uses `handle` (mutually exclusive, source-ordered) — an earlier
  documented `redir`-based version was WRONG because Caddy sorts `redir`
  before `handle`, which would have defeated the exemption.
- Public reference for integrators: **`docs/DOOR-REPO-API.md`** — written
  for the original 68K AmiExpress author, who is implementing a client.
  Byte-exact `list.txt` spec, real captured examples, archive-name quoting
  (real names contain `&`), append-only versioning promise.
- Design spec: `thoughts/shared/plans/2026-08-17-door-repo-central-api-design.md`
  Plan: `thoughts/shared/plans/2026-08-17-door-repo-api.md`

**Catalog data also fixed this session:** re-typed `door_type` over
already-indexed archives and indexed the ~89 never-indexed
`Archives/DayDream/` archives. Live counts: DD 10 / SIM 14 / FIM 67 /
XIM 3201, 3301 total — so DOORMAN's system filter shows a real DD bucket.
Live DB merged via an **ATTACH staging database**; never text-dump this
catalog to SQL (`doc_raw` carries control bytes that break serialization).
Backup on the host: `amiexpress.db.bak-catalog-delta`.

## Part 2 — DOORMAN filter arc (CLOSED, user-confirmed on live)

User verified on live: "looks great now". Six rounds, each a different
layer — worth reading if a similar input bug ever reappears:

1. `f`-leak: activation deferred past the keystroke (superseded).
2. Synchronous one-shot guards on both delivery paths (batched-payload
   race + blessed's phase-2 re-delivery).
3. Root cause under those: `KeyBinder` discarded every handler's return
   value, so no hotkey could mark itself handled → Tab hit blessed's
   default focus-next branch.
4. `filterBox` made display-only (`keys:false, inputOnFocus:false`): the
   SDK `Textbox` self-edits on ANY focus, so one mouse click enabled a
   parallel editor bypassing every guard. This was the real cause of
   "c gets typed, focused or not".
5. SDK parser: a CSI/SS3 escape sequence split across network chunks was
   misparsed as a standalone Escape, popping the whole RepoView — which is
   why arrow-key browsing appeared to reset the system filter.
6. The ESC-timeout fallback called `_emitKey` outside the `_handlingData`
   guard, so it could double-fire Escape and empty the view stack (frozen
   door). Fixed with capture-and-clear + guard held in a `finally`.

## Consumer side — complete, reviewed, UNPUSHED

DOORMAN gains: repo client (ETag cache, sha256-verified downloads,
request timeouts, generated-type staleness guard), consumer-mode browsing
with an `OFFLINE (cached <date>)` banner, consumer install (download →
verify → existing extract flow → local `door_catalog` upsert with
`source='door-repo'`), and role gating that hides curation actions.
All ten plan tasks passed task-scoped review; T3 took 3 fix rounds, T5 two,
T4/T7 one each.

## Findings the reviews caught that matter later

- **Node undici always sends `Cache-Control: no-cache` when `If-None-Match`
  is present.** Our RFC-correct server therefore never returned 304 — the
  whole ETag design was inert for real clients. Found ONLY by the no-mocks
  E2E test; both sides' unit tests passed happily. Fixed by sending
  `Cache-Control: max-age=0` (chosen over `cache:'force-cache'`, which only
  works while undici lacks a cache store).
- **Measured 21,760 ms event-loop stall**: `/manifest` and unfiltered
  `list.txt` hashed the whole 167 MB corpus synchronously, cold after every
  deploy, publicly triggerable. Fixed by precomputing `md5`/`sha256`
  columns at index time with a bounded lazy fallback: now 39-55 ms.
- **Pre-commit hook rebuilds a door's ENTIRE `dist/` from disk** and
  auto-stages it, so a commit by one agent sweeps in another's uncommitted
  work (happened once, caught and reverted). Never run two tasks touching
  the same `Doors/<door>/` concurrently in one worktree.
- `instanceof Error` fails across Jest's VM realm (a DOMException from
  another realm) — check `.name` instead.

## Open items (with rulings already made)

- **I7 — no CI runs any of these tests.** `.github/workflows/` has
  `door-ci.yml.disabled`; nothing invokes jest. RULING: deferred to the
  user — the `.disabled` suffix looks deliberate and re-enabling may fail
  on pre-existing conditions. Recommend re-enabling at least the
  `web/backend` jest suites, because the type-drift guard, the
  path-traversal test and the fd-lifecycle tests are all manual-only today.
- Deferred minors (full list with reasoning in the ledger): `app.ts` at
  ~1900 lines vs a 2000-line hook warning (extractable: `installConsumerDoor`,
  `extractAndRegisterDoor`, gating helpers → `repoInstall.ts`);
  `door-repo-manifest.ts` duplicates `door-catalog.service.ts`'s DB_PATH
  expression; `?q=` searches `installed_as` (owner-local field);
  `X-Door-Repo-Revision` absent on Express's default 404; consumer footer
  still advertises `[A]`=Archive which has no data for manifest-only rows;
  `ManifestDoor`/`DoorRepoManifest` should eventually live in a shared
  package instead of a generated mirror.
- From the earlier DD wave, still unverified by the user: DD door
  type-ahead, and the sysop page-accept chat flow (needs two sessions).
- Live `DEBUG_68K=1` is still ON in `/app/amiexpress/docker-compose.yml`
  — turn off when the DD/FAME shakedown period ends.
- 19 exploratory DayDream doors were pushed at **ACCESS=0** (user's
  explicit call, overriding a sysop-only recommendation) and are unverified
  — some may crash or hang a session.

## Unpushed commits at handoff (oldest last)

```
fc035ffd2 chore(db): backfill md5/sha256 digests for door_catalog
222de4de6 perf(door-repo): precompute archive digests to stop event-loop stall
10458d50a fix(doorman): bound repo-client requests with timeouts, normalize repo URL
feee74927 docs(door-repo): use compose bare pass-through to keep default URL single-sourced
d12ff25d9 docs(door-repo): wire DOOR_REPO_ROLE/URL into compose, fix Caddy snippet and version-bump docs
ab1d7b393 fix(doorman): send Cache-Control: max-age=0 so manifest ETag revalidation actually works
523b7f9a1 docs(handoff): door repo API live, DOORMAN filter arc closed
e45400955 test(door-repo): end-to-end consumer flow against local fixture server
06ada320a feat(doorman): consumer mode hides repo curation actions
257b853d5 fix(doorman): upsert a local catalog row for first-ever consumer installs
bda800af2 feat(doorman): consumer installs download and verify from the central repo
5b3ca0575 feat(doorman): consumer mode browses the central repo
f9d12f5c6 fix(doorman): revert dist/ pollution from a concurrent task's uncommitted work
410d25442 fix(doorman): staleness guard for repo-types.generated.ts + missing branch tests
698f076ef feat(doorman): repo client with ETag cache and sha256-verified downloads
```

## Environment quickref (session-tested)

- Jest from `web/backend`: `SKIP_DB_INIT=1 npx jest --config
  dev-scripts/jest.config.ts --rootDir . <path>`. Do NOT run the full suite
  under load (OOMs); targeted suites only.
- `npx tsc --noEmit` must be clean in BOTH `web/backend` and
  `Doors/door-manager` for door changes; `Doors/door-manager/dist` must be
  rebuilt and committed (dist is what runs).
- Live: `root@89.167.21.154`, container `amiexpress-bbs`. Deploys never
  refresh the live `Doors/` volume — force-sync after any door change:
  `docker exec amiexpress-bbs sh -c 'cp -rf /app/default-data/Doors/<door>/.
  /app/data/bbs/Doors/<door>/'` and verify a marker string in the dist.
- Live catalog DB: `/app/data/db/amiexpress.db` (NOT
  `/app/data/bbs/database.sqlite`, which is a decoy).
