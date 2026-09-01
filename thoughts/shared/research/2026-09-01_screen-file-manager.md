---
date: 2026-09-01
topic: The admin has no way to see or edit the board's screen files
tags: [admin, screens, ansi, todo]
status: draft
---

# A screen file manager for the admin

Requested by the sysop, 2026-09-01: *"the admin interface needs a screen file
manager where I can view/edit/upload/replace/etc all screenfiles in the BBS."*

Not started. This is the scoping, with the numbers measured off the live
board, so whoever picks it up does not start by counting.

## What exists today

**Nothing for screen FILES.** `ScreenTypesPage` is about `ScreenTypes.info` -
the display types offered at login, ANSI/RIP/IBM - not the files themselves.
Configuration Files handles `.info` files only.

So the sysop's LOGON screen, menus and bulletins can only be changed by hand
on the volume.

## What it has to handle

Measured on the live board:

- **59 `Screens` directories**, holding **790 files**.
- Three levels: the board's own `Screens/`, per-node `Node<N>/Screens/`
  (40 nodes), and per-conference `Conf<N>/Screens/`.
- Loose screens outside those directories too - `BBSTITLE.txt`, `.rip` files.

A flat list of 790 will be as unusable as Configuration Files was at 1111.
It needs the same treatment: group by scope, and let the search match the
PATH so a node or conference can be picked out.

## How AmiExpress actually resolves a screen - read from express.e

**Corrected.** An earlier version of this note said `Screens/` was a master
with a node -> conference -> global fallback. That was read off THIS PORT, not
off express.e, and it is wrong.

`express.e:6544-6640` selects ONE directory per screen type and gives up if
the file is not there. There is no fallback:

| screen | directory |
|---|---|
| LOGON, LOGOFF, BBSTITLE, AWAITSCREEN, JOIN, JOINED, JOINCONF, NODE_BULL | `nodeScreenDir` |
| MENU, CONF_BULL, JoinMsgBase, DownloadMsg | `confScreenDir` |
| BULL | `cmds.bbsLoc` |

`findSecurityScreen` then handles the security-level variants WITHIN that one
directory (`MENU250.TXT` before `MENU.TXT`), and the type extension.

So **the duplicates are correct AmiExpress**: LOGON only ever resolves from the
node's own directory, so forty nodes need forty copies. There is no master to
edit, and "edit once" is not something AmiExpress offers.

## The sanctioned way to share - and it is a tooltype, not a file operation

`nodeScreenDir` comes from each node's **`SCREENS` tooltype**, defaulting to
`<bbsLoc>/Node<N>/` (`ACP.e:2666-2673`). `confScreenDir` comes from the
conference's `SCREENS` tooltype (`express.e:5052-5054`).

Point several nodes at one directory and they genuinely share screens. That is
express.e's own mechanism, so using it is better AND strictly 1:1.

Measured on the live board: **891 files under Screens directories, 85 distinct
contents.** Ninety per cent are byte-identical copies that could be a shared
`SCREENS` path instead.

## Where "better than AmiExpress" is allowed to live

The rule that keeps both promises:

**1:1 in the READ path. Better in the WRITE path and in configuration.**

- Resolution must match the table above exactly. A screen this port finds and
  a real Amiga does not is a parity bug, not a feature.
- The admin may let a sysop edit "the LOGON screen" ONCE and write the forty
  node copies AmiExpress requires. The Amiga sees exactly the files it expects.
- The admin may offer to collapse identical copies onto a shared `SCREENS`
  tooltype, which is express.e's own answer to this problem.

## What the live board actually resolved - measured 2026-09-01

Three screens were reaching callers ONLY through the invented fallback, which
means a real Amiga would have shown none of them:

| screen | before | after |
|---|---|---|
| AWAITSCREEN | 0 of 41 nodes | 41 of 41 - file moved to `Node<N>/` |
| BBSTITLE | 0 of 41 | 71 of 71 - file copied to `Node<N>/` |
| SCREEN_BULL | absent at board root | at the root, and the resolver now looks there |
| NODE_BULL | 0 of 41 | still 0 - see below |
| LOGON, LOGOFF, JOIN, JOINED, JOINCONF, GUESTLOGON | 41 of 41 | unchanged |

**Two of these measurements were wrong on the first pass, both in the same
way: matching what was convenient instead of what the loader accepts.**

- `head -6` truncated a directory listing and LOGON looked absent everywhere.
  The scripted count corrected it.
- The extension glob matched ANY extension, so `Node<N>/BBSTITLE.SEQ` counted
  as BBSTITLE being present. It is not: `ScreenTypes.info` on this board
  declares only `TXT.GR` and `IBM`, so `.SEQ` satisfies nothing for an ANSI
  caller. What caught it was the board's own screen log -
  `Found security screen for BBSTITLE at: /app/data/bbs/Screens/BBSTITLE.txt`,
  the fallback - not the measurement.

Measure with the extensions the loader accepts, and confirm against
`docker logs ... | grep loadScreenFile`, which prints the search locations and
the file it settled on.

**`.SEQ` is this project's own addition, for C64 PETSCII, not stray Amiga
data.** `addPetsciiVariants` tries `.seq`/`.SEQ` BEFORE `.txt`, so adding a
`.txt` beside it does not shadow it. PETSCII does not render correctly yet -
known, deferred, and the resolution half is not the problem: petsciiMode is
set in six places including C64 detection at connect and the telnet server.

**None of these fixes are in the repo.** `sync_tracked` covers six board
`.info` files and `Commands/**`, so nothing under `Node<N>/` or `Conf<N>/`
reaches the volume from a commit. They were applied to the volume directly
and a rebuilt board would need them again. Worth solving properly.

## DEVIATION: this port invents a fallback

`screen.handler.ts` adds search locations it labels `Screens (Fallback)` and
`Node<N> (Fallback)`. express.e has none. A screen that exists ONLY in
`Screens/` displays on this board and would be MISSING on a real Amiga.

Introduced incidentally in `939530f5d` (a XIM pause/output refactor), not as a
considered decision. It WAS masking absent per-node files, and three of them are now fixed. The
one left is NODE_BULL: 39 nodes hold `Node<N>/Screens/NODE_BULL.TXT`, a
filename NOTHING reads - not express.e, which wants `nodeScreenDir + 'BULL'`,
and not this port, which maps NODE_BULL -> BULL. Those nodes have no node
bulletin today, anywhere. Moving those files would ENABLE a second bulletin at
logon on 39 nodes, which is new behaviour rather than restored parity, so it
is the sysop's decision and not a mechanical fix.

The fallback can go once that is settled, and not before.

## Care

- **Never normalise a filename.** The security level and the type extension
  are the routing, and renaming one silently unroutes a screen.
- **Never add a lookup rule.** Resolution is express.e's table, verbatim. The
  fallback above is what happens when that slips.
- **Bytes, not text.** Read and write latin1; do not let a JSON round-trip
  near the content.
- `screen.handler.ts` is 2959 lines against the repo's 2000-line hook, so any
  backend work there needs an extraction first.
