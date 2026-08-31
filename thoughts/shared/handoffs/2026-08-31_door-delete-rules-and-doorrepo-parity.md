---
date: 2026-08-31
topic: The door-delete rules, the registry guard, DOORREPO parity phase D, and the release pipeline
tags: [handoff, doors, delete, doorrepo, doorman, sdk, deploy, shrinkler]
status: final
---

# Session handoff, 2026-08-31 (evening)

Everything below is on `main` and deployed unless it says otherwise. The
container was verified by reading `/app/.git-sha` and grepping the running
filesystem, not by trusting a green workflow.

Read with `handoff.md` and the earlier handoffs from the same day - this one
starts where `2026-08-31_doorrepo-doors-and-deploy-fixes.md` left off, and
several of its "next steps" turned out to be wrong in ways worth knowing.

## The one theme

**A door is its REGISTRATION, and every path that forgot that left one
behind.** Five separate live reports today were the same defect wearing
different clothes: a delete that removed files and left the .info; a delete
that removed OTHER doors' .info files; registrations pointing at doors that
no longer existed, shadowing the BBS's own commands; a TypeScript door whose
registration was never found because the code guessed its name; and a door
list showing entries nothing could run.

## What shipped

### The registry guard

A `<CMD>.info` whose LOCATION resolves to nothing is dropped when the
command cache is built (`commandLocationIsLive`,
`amiga-command-parser.util.ts`, applied in `scanCommandDirectory`).

The plan said to filter in `initializeDoors`. **That was the wrong level**
and is corrected in the spec: dispatch reads `commandCache`
(`command-execution.handler.ts:390`), and so does the internal-command
router (`internal-commands.ts:127`, which hands any name present there
straight to the door). Filtering the `doors` registry would have tidied the
MENU and left `G` still swallowing the internal goodbye.

Conservative on purpose, and measured before it was written: of 149 local
BBSCmd registrations, 107 resolve to a file, **41 resolve only to their
directory** (24 of them TypeScript doors pointing at
`Doors/bbslink/bbslink`, which has never existed), and 1 to nothing. So a
missing FILE under an existing door directory stays; only a missing
DIRECTORY is dead. INTERNAL aliases (express.e:4732) and MCI commands
(express.e:4295) are exempt - neither reads LOCATION from disk.

It skipped 163 BBSCmd + 5 SysCmd on live.

### The delete, three defects

`deleteAmigaDoor` treated `dirname(LOCATION)` as "the door's directory".

1. **A shared directory.** `Doors/emp_tools` holds Joincnf (J) and Bulls
   (B). Deleting either removed the directory whole and every registration
   pointing into it.
2. **A LOCATION naming a directory.** `BestConf` is
   `LOCATION=Doors:BestConf`, whose parent is `Doors:` itself - so every
   registration on the board matched. The 2026-08-30 containment guard stops
   the TREE being removed; nothing stopped the REGISTRATIONS being removed.
3. **Case.** `B.info` says `DOORS:EmP_Tools/Bulls` where `J.info` says
   `Doors:emp_tools/Joincnf`; `resolveAssign` returns the unresolved join
   when it cannot canonicalise, and the containment test compared strings
   case-sensitively. Older than the other two, and probably why seven
   registrations went rather than the whole board.

The rule now: **a door owns its FILE.** `ownDirectoryOf` takes the LOCATION
when it IS a directory, else its parent, and returns null on the BBS root,
`Doors:` or `Commands`. A registration resolving to the SAME file is an
alias and goes with the door; a DIFFERENT file in the same directory is a
co-tenant, stays, and blocks the directory delete. All comparisons go
through `comparablePath`.

Also fixed: a door registered only under `Conf<N>Cmd`/`Node<N>Cmd` could
never be deleted (`findCommandRegistrations`, in express.e's own precedence
order), and a TypeScript door's registration was found by rebuilding its
command name from the DIRECTORY and looking for a `BBSCMD` tooltype - which
most .info files here do not have, because the filename IS the command. That
was the GWWALL report: files gone, door still listed, success on screen. A
surviving registration now counts as a failed delete.

### The rules exist twice, on purpose

DOORREPO deletes doors on a real AmiExpress board where there is no server
to ask, so the same rules live in `examples/doorrepo-c/flow.c`
(`flow_own_directory`, `flow_registration_class`, `flow_path_comparable`)
and in `web/backend/src/doors/door-registration-paths.ts`. Neither can be
removed.

**`examples/doorrepo-c/tests/delete-rule-cases.txt` is what keeps them
honest** - one table of cases, read by `tests/test_flow.c` and by
`web/backend/tests/doors/delete-rule-parity.test.ts`. Add a case there and
both sides fail until both are fixed.

### DOORREPO, parity phase D

`T` edits TYPE/STACK/MENUNAME in place (M keeps ACCESS, which writes
DRACCESS too). `H` shows what the door has done, read back from the log. And
`ENTER` runs a door from the board list via RETURNCOMMAND (XIM 136) - the
queue-then-exit order DOORMAN uses, because two doors cannot share a node.

**Phase E is WITHDRAWN.** DOORMAN is kept: it is the reference
implementation of rules the C door carries too, and the sysop said so.
Upload-from-the-sysop's-machine is the one thing DOORREPO cannot do and is
explicitly not wanted.

### Smaller things that were live bugs

- DOORMAN drew every DayDream door as `[??]`; the badge is now the type's
  own first two letters for anything not explicitly mapped.
- After a delete, DOORMAN's info panel kept describing the deleted door
  until the cursor moved - three writers, last one won.
- The SDK's confirm dialog framed BOTH buttons and filled both; only the
  focused one is framed now, and the idle one is legible.
- DOORMAN wrote `ACCESS=0` on every install. express.e:4703 reads that as
  DENIED. Benign here, wrong on any real board - the C door had the same bug
  and was fixed this morning.
- `report_install_to_bbs` has never worked (the door cannot call the BBS it
  runs inside). It writes `DoorRepo.installs` now and `door.handler` reads it
  on the door's exit path.
- The doorserver healed an archive's file list but not its `archive_size`,
  `md5` or `sha256`, so the door warned "digest is probably stale" on every
  download. `ads_stripped` now follows from the junk count.

### The board and the pipeline

- **168 dead registrations pruned** on live, renamed to `.info.orphaned`,
  after a full backup to
  `/root/bbs-backups/commands-before-prune-20260831-150721.tar.gz`. Audit in
  `Commands/.orphan-prune-applied.txt`. 0 dead remain; the 91 kept-but-
  binary-absent ones are legitimate (bbslink and directory-style LOCATIONs).
- **A deploy that cannot start now rolls back.** The workflow already built
  before recreating, so a failed BUILD was never the problem - the hole was a
  container that starts and does not serve. The previous image is tagged
  `amiexpress-bbs:rollback` before the build and restored if `/health` never
  answers. The deploy still fails; the board is up while somebody reads it.
- **Door releases are Shrinkler-packed** (121,608 -> 45,968 bytes for
  DoorRepo). See the `shrinkler-door-releases` skill, and note the trap: a
  crunched door needs MORE emulator memory, not less, so crunched DoorRepo
  (513 KB) is refused by the 500 KB door region while a smaller door is fine.
  The archive carries both binaries.
- **Designer templates** for the ASCII/ANSI artists live in
  `examples/doorrepo-c/design/`.

## Learnings

- **Where the shadowing lives decides where the fix goes.** Dispatch and the
  internal-command router both read `commandCache`; the `doors` registry is
  downstream of it. A plan that names a file is not evidence.
- **Measure the shape of the data before writing a rule about it.** The 41
  registrations that resolve only to their directory would all have been
  unregistered by the obvious rule.
- **The tool's own verification earns its keep.** The release script
  rebuilds the packed source and re-runs its tests; that is what caught the
  missing case-table fixture. It also caught a sample archive that had left
  the curated catalog.
- **A green workflow is not a running board, and a symbol-free binary is not
  a stripped one that was checked.** Both were verified by looking.
- **`git stash` in this repo is still a trap** (the CRLF phantom files). I
  used it once by reflex; it worked, but the safe form is
  `git checkout <ref> -- <paths>`.

## Still open

- **Yours:** one "Learn as junk" click for `7hE-EdGE` in the admin UI, which
  fixes that pattern for every archive.
- **Yours:** nobody has driven DOORREPO's `T`, `H`, `ENTER` or an uninstall
  in a shared directory by hand. `emp_tools` is the interesting case.
- The `.info` write route (`PUT /installed/:cmd/info`) and the streaming
  DELETE are still untested on live.
- `Doors/door-manager/app.ts` sits at ~1940 lines against the 2000 ceiling;
  the next feature there needs an extraction first.

## Other notes

- Live: `https://bbs.uprough.net`, door server `https://doors.uprough.net`.
  Host `root@89.167.21.154`, key `~/.ssh/hetzner_deploy`, port 22.
  `BBS_DATA_DIR=/app/data/bbs`. Backend listens on 3001.
- The doorserver is a separate repo and a separate deploy
  (`/Users/spot/Code/amiexpress-doorserver`).
- Two peer sessions worked the same tree today; both messaged rather than
  editing over each other, and the delete fix nearly landed twice.
