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

## The rule a manager must not break

`web/backend/src/utils/screen-security.util.ts` is a 1:1 port of express.e's
`findSecurityScreen()` (express.e:6246-6310). A screen is not one file:

- A screen has SECURITY-LEVEL VARIANTS - `MENU250.TXT` is the menu for level
  250, `MENU.TXT` the fallback. The board picks the highest variant at or
  below the caller's level.
- A screen has a TYPE EXTENSION per ScreenTypes - `.TXT`, `.TXT.GR`, `.IBM`.
- Lookup is CASE-INSENSITIVE by resolution (`resolveCaseInsensitivePath`),
  because the volume is an Amiga one and the container is not.

So the manager must show variants as what they are - one screen with several
files - rather than 790 unrelated names, and it must not "helpfully" rename
anything: the name IS the routing.

## Shape

1. A page grouped board / nodes / conferences, with search over the path -
   the same fix Configuration Files needed
   (`web/config-app/src/pages/info-file-list.ts`).
2. View with the ANSI actually rendered, not as text. The board already
   renders ANSI in the browser terminal, and `sdk/engines/ui/ansi-editor`
   exists.
3. Edit, upload, replace, delete. Uploads must be byte-exact: a screen is
   latin1/CP437 with escape sequences, and anything that round-trips it
   through UTF-8 destroys the high-bit characters. See the memory
   `feedback_edit_tool_destroys_high_bit_bytes` - this is the same hazard.
4. A backup before replace. `BBSTITLE.TXT.bak.stale` on the live board says
   somebody already wanted one.

## Care

- **Never normalise a filename.** The security level and the type extension
  are the routing, and renaming one silently unroutes a screen.
- **Bytes, not text.** Read and write latin1; do not let a JSON round-trip
  near the content.
- `screen.handler.ts` is 2959 lines against the repo's 2000-line hook, so any
  backend work there needs an extraction first.
