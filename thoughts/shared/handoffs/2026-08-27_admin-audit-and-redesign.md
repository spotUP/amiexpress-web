---
date: 2026-08-27
topic: LiveChat and BBS fixes, the admin interface audit, and the redesign handover
tags: [handoff, admin, config-app, livechat, deploy, audit, redesign]
status: final
---

# Handoff - admin audit done, redesign ready to start

Next session's split, agreed with the user:

- **The main session implements the admin redesign** (Phase 1 of
  `thoughts/shared/plans/2026-08-27-admin-redesign.md`). Design work needs the
  user's visual feedback, so it belongs where they can see and steer it.
- **An agent finishes the audit** - the remaining page verification and the
  Computers/Protocols fix described below.

**Instruction the audit agent MUST be given:** read each service's mutation
path. Do not classify by counting. Scripted counting produced false positives
three separate times in this session - "14 of 28 pages broken" became one real
bug, and a later "ten pages write only SQLite" was wrong about every one of
them. Every claim is a lead until the mutation path has been read.

## State of the tree

`main` has **6 unpushed commits** (below). Live runs `cc15a318f`, which is
older than HEAD - the unpushed work is not deployed.

| Commit | What |
|---|---|
| `3c3a19c43` | the redesign plan |
| `b8e1dba37` | saving a screen type no longer erases the others |
| `9ad90c24e` | system-wide node commands reach a route that exists |
| `1c84c3e74` | creating a door can no longer destroy an existing one |
| `e3598d652` | correction: most admin pages were already disk-first |
| `d705b9fc8` | the page-by-page audit |

Deploying disconnects everyone in /chat, but they now get a 60-second
countdown first. Pushing to `main` deploys automatically.

`Commands/BBSCmd/wall.info` is modified in the working tree - the user's own
admin edit writing the repo's copy. Left uncommitted deliberately; it is their
BBS data.

## The admin audit - conclusion

Two documents, both current:

- `thoughts/shared/research/2026-08-27_admin-ui-audit.md` - storage model
- `thoughts/shared/research/2026-08-27_admin-page-by-page.md` - per-page
  verdicts, including a correction section

**The headline, after two corrections: the admin app is largely disk-first
already.** The BBS reads `.info` files; SQLite is downstream (boot reads
conferences from disk, then `syncConferencesFromDisk` brings the table into
line). SystemConfig writes `bbsConfig.info`, Conferences and Drives write
`Conf<N>.info`, Users sync to `user.data`, and the lookup services all write
their own `.info`. `security-config` was the ONE service with no filesystem
access at all - which is why the Security page was disconnected, and that is
fixed.

**The redesign does not need a storage rewrite underneath it.**

### Fixed this session

| Fix | Was |
|---|---|
| Security page | wrote a DB table the BBS never reads; hardcoded level list; no delete control. Now reads and writes `Access/ACS.<level>.info`, levels come from the files that exist, and a level can be created by copying the nearest lower one |
| Door edit | looked up a positional id (`index + 1`) as a database row - "Door 349 not found". Now identified by command, writes `Commands/BBSCmd/<command>.info` |
| Door rename | deleted the `.info` and wrote a fresh one. Now MOVES it, so STACK, MULTINODE and the icon survive |
| Door create | uniqueness was checked against the `doors` TABLE while doors live on disk, so creating over an existing command replaced a binary `.info` with plain text. Both parse, so it was silent |
| Door name | the API served a door's filename as `door_name`, so saving wrote the command into the NAME tooltype and renamed the door |
| Door schema | GET served `XIM`/`vamos`; PUT validated a different vocabulary and rejected the server's own data. Four vocabularies now come from `constants/door-types.ts` |
| Screen types | read from disk, written from the DB - and the table has ZERO rows against two entries on disk, so one edit erased both. Now merged through `config-merge.util.ts` |
| Node commands | posted to `/api/system/*`, mounted nowhere; handlers are at `/api/nodes/*` |
| Typecheck | `web/config-app` never compiled - missing `vite-env.d.ts`, swallowed by a .gitignore rule for generated declarations |

### Still open in the audit

1. **Computers and Protocols have the screen-types bug.** Same asymmetry: read
   disk, write from the database.
   - `ComputerList.info` holds 9 entries; the `computers` table does not exist.
   - `Protocols/` holds 9; the `protocols` table holds 7.
   `mergeForWrite` in
   `web/backend/src/services/config-services/config-merge.util.ts` is what they
   should use - see `screen-config.service.ts` for the shape, including the
   `remove` argument the delete path needs because the merge starts from a disk
   that still has the entry.
2. **Per-field round-tripping is unverified** for every page. The door NAME bug
   is the warning: a field that round-trips wrong renames things silently.
3. **Languages, FileCheckers, Nodes** - their writers do touch disk, but were
   not read closely enough to rule out the same read-disk/write-DB asymmetry.

## The redesign

`thoughts/shared/plans/2026-08-27-admin-redesign.md`, written by a planning
agent and then spot-checked by hand.

- **Radix Primitives in the shadcn/ui form** - vendored source, no component
  library runtime - plus TanStack Table, staying on Tailwind. Radix Themes was
  rejected because its own reset, tokens and ~180 kB of CSS would run alongside
  Tailwind for the whole migration.
- Six phases. **Phase 0 is already done** (vite-env.d.ts, the `/api/system`
  path, its doc comments), and **Phase 3's door work is already done** - the
  agent's snapshot predates both.
- Navigation goes from a flat 27-item sidebar to 13 grouped destinations plus 5
  secondary, landing on an Overview dashboard instead of a 1,729-line form.

### Four findings the audits missed, verified by hand

1. **117 Tailwind class names compile to nothing.** Only six `bbs-*` colours are
   defined in `web/config-app/tailwind.config.js`; `bbs-border` (78 uses),
   `bbs-secondary` (18), `bbs-background` (14), `bbs-hover` (6) and `bbs-error`
   (1) are not among them. Invisible borders and missing panel backgrounds
   across 14 files. **This is the cheapest visible win available and should be
   the first commit of Phase 1.**
2. **`InfoEditorPage` is orphaned** - 351 lines, imported by nothing,
   unreachable. Its tooltype comment-toggle and add/remove features are not
   available to a sysop today.
3. **Nothing joins the `admin` socket room**, so the `import:progress` events
   emitted to it (`bbs-event-emitter.ts:213`) have never reached a browser.
4. **The admin app consumes a real BBS node.** `OperatorChatPage` opens a socket
   with a JWT and no `chatOnly` flag, so `io.on("connection")` falls through to
   node assignment. Every visit burns a node. This is why the plan's Phase 2
   adds an `adminOnly` handshake branch - the one additive backend change in the
   whole plan.

### Design decisions the user has not yet ruled on

Raised but unanswered: retiring red from every button (it currently reads as
danger everywhere), 13 px base type with a density toggle, dropping `font-mono`
from `body`, showing each field's tooltype key (`bbsConfig.info : SYSOP_NAME`),
and removing autosave from SystemConfig - a debounced write to a file the
running BBS reads.

## Everything else fixed this session, live already

Deployed and verified on the live container:

- **Graceful deploys.** The workflow builds first, signals the running
  container, waits 60 seconds, then recreates. Proven on its first real run:
  signal 21:39:21, container recreated 21:40:22. `/chat` reconnects itself.
- **Event doubling** - two independent causes: a redundant `bbs:event` bridge in
  `createDoorSocketWrapper` (the broadcast already reaches door handlers through
  `onAnyOutgoing`), and `room:user-joined`/`-left` emitted twice.
- **`/msg` silently doing nothing** - `chat:dm` dereferenced `d.from` before its
  own null guard and threw out of the handler.
- **Chat log corrupted by a newline** - one `chatMessages` entry per MESSAGE,
  but the animation manager addresses display ROWS.
- **Sysop chat state discarded every call** - tsx/esbuild emits no
  `design:paramtypes`, so `container.resolve` threw every time and the fallback
  built a fresh state-owning use case.
- **Camera blinking** - every voice join/leave restarted everyone's capture; it
  now reshapes in place.
- **Self view and honest placeholders** - you can see your own camera, and an
  empty channel says so.
- **Stay logged in** and **chat history on open** - the token was never minted
  by the modal, and history was fetched but written through a path suppressed
  while a door owns the screen.
- **Doors missing dependencies** - the entrypoint installed only when a door
  used better-sqlite3. Eleven doors were repaired on the next deploy, whip among
  them.
- **The latency probe** ("avg 2ms worst 4ms paint 4ms") is removed from the BBS.

## Open, not audit or redesign

- **Audio stutter** - one measured cause fixed (58.4 ms of audio per minute
  discarded at capture block boundaries). Diagnostics are live: a call that
  stutters now logs `[Audio][stutter]` naming whether the sender's main thread
  or the network is late. NOT yet confirmed fixed by the user.
- **DOORMAN cannot see the wall door** - unexplained. WALL IS registered on live
  (350 doors) and `getDoorList()` applies no access filter, so two theories are
  already ruled out. Needs to know which DOORMAN view the user was on:
  installed, or repo browse (a local door would not appear in the repo at all).
- **The live copy of dRE!WAll is incomplete** - locally it has `.dAtA`, `.info`
  and four `.StYlE.*` files; live has only the binary.
- **`wall.info` NAME is still "WALL" on live**, overwritten before the rename
  fix. The original is in `wall.info.backup` beside it.
- **Level 30 has no `ACS.30.info`.** Not a fault - `findAcsLevel` scans down and
  finds ACS.20 - but the Security page can now create one if the user wants
  level 30 to have its own flags.

## Gotchas earned this session

- **Read the mutation path.** Counting produced wrong answers three times.
- **`screen.focused` is a boolean about the Screen itself**; the focused element
  is `screen.getFocused()`. This cost an hour twice - once in a test of mine,
  once in a door diagnostic that could only ever print "none".
- **SDK tests import the built `sdk/dist`**, not the source. A source edit is
  invisible to them until `npm run build:cjs`.
- **78 stale backend processes** were found running at once. `tsx` does not
  hot-reload; a source change needs a restart, and a stale process serving old
  code looks exactly like a failed fix. Zombie-verify every time.
- **The live log is not the current log.** A container is replaced by every
  deploy; a pulled log goes stale immediately.
- **`head` truncates evidence.** "Live has no WALL door" was wrong because the
  grep was cut off at six lines.
