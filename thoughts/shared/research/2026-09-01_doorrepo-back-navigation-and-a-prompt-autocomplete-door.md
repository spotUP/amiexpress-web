---
date: 2026-09-01
topic: Two things the sysop asked for while testing DoorRepo
tags: [doorrepo, 68k, navigation, autocomplete, backlog]
status: draft
---

# Two asks from the 2026-08-31 test session

Both raised while testing the DoorRepo command bar. Neither is started.

## 1. Cannot back out of subpages in DoorRepo

**Reported:** "i can't back out of subpages in doorrepo."

Not yet diagnosed. What is known from the source:

- The screens each run their own key loop and each decides its own way
  out. `ui_help_screen` returns on `q`/`Q` only. Others (`history_loop_ansi`,
  `board_loop_ansi`, `files_loop_ansi`) need checking one by one - there is
  no shared "this is how you leave a screen" rule, which is itself likely
  the root of the complaint.
- **ESC is deliberately not a binding.** `ui_text_prompt` and
  `ui_filter_prompt` both carry the comment "a bare ESC is not a binding -
  see ui_read_key()", because ESC also opens every cursor-key sequence and
  the door cannot tell a lone ESC from the start of one without a timeout.
  So a sysop pressing ESC to back out gets nothing at all, on every screen.

**Where the fix probably belongs:** one shared answer to "how do I leave",
applied to every subpage, advertised in the footer of each - not a
per-screen patch. Check what the keys currently are before choosing; `Q` may
already be right and simply unadvertised, in which case this is a footer
bug rather than a navigation one.

**First step:** enumerate every screen loop in `doorrepo.c`, list the key
each accepts to leave and what its footer claims, and put that table in
front of the sysop before changing anything.

## 2. A 68K door that gives the BBS PROMPT autocomplete

**Asked:** "let's write a 68k door in C that adds autocomplete to the bbs
prompt - is that possible so it works on Amiga 68k AmiExpress?"

Short answer from what this repo already proves: **the completion logic is
the easy half and already exists; whether it can wrap the BBS's own prompt
is the open question.**

What is already true:

- `flow_command_suggest` / `flow_command_ghost` (`examples/doorrepo-c/flow.c`)
  are C89, no allocation, no platform calls - they are the same logic a
  prompt completer needs, and they cross-compile to 68K today.
- DoorRepo already draws a live-updating panel over a running screen in
  ANSI on a real serial terminal (`ui_command_bar`), so the DRAWING half is
  solved and can be lifted.

What is not known and decides the whole thing:

- **A door does not own the prompt.** AmiExpress reads the command line
  itself; a door runs when a command is dispatched. So a door cannot
  intercept keystrokes at the main prompt unless AmiExpress hands them over.
  Check `express.e` for what the prompt loop does per keystroke and whether
  any door type is given the line before it is parsed.
- If it cannot, the honest shapes are: (a) a door that OWNS a
  prompt - the sysop runs it and gets a completing prompt that dispatches
  back via RETURNCOMMAND (XIM 136), which this door already does; or (b) a
  change to AmiExpress-web's own prompt handling, which helps the web board
  and does nothing for real 68K AmiExpress.
- Option (a) is buildable today and reuses everything above. Say so before
  anybody starts (b).

**First step:** read `express.e`'s prompt loop and answer, with line
numbers, whether a keystroke at the main prompt can reach a door at all.
Everything else follows from that answer.
