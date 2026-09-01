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

## DEVIATION: this port invents a fallback

`screen.handler.ts` adds search locations it labels `Screens (Fallback)` and
`Node<N> (Fallback)`. express.e has none. A screen that exists ONLY in
`Screens/` displays on this board and would be MISSING on a real Amiga.

Introduced incidentally in `939530f5d` (a XIM pause/output refactor), not as a
considered decision. It may already be masking absent per-node files on the
live board - which would mean removing it breaks screens that currently work,
so measure before touching it: for each screen the board actually displays,
check whether it resolves from its express.e directory or only from the
fallback.

## Care

- **Never normalise a filename.** The security level and the type extension
  are the routing, and renaming one silently unroutes a screen.
- **Never add a lookup rule.** Resolution is express.e's table, verbatim. The
  fallback above is what happens when that slips.
- **Bytes, not text.** Read and write latin1; do not let a JSON round-trip
  near the content.
- `screen.handler.ts` is 2959 lines against the repo's 2000-line hook, so any
  backend work there needs an extraction first.
