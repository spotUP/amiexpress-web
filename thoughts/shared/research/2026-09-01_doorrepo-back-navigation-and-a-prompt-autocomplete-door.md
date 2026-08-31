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

## 2. Autocomplete at the BBS prompt

**DEFERRED. Decided 2026-09-01, after reading express.e.**

### The finding that settles the shape

A door cannot do it on real AmiExpress. The prompt loop is
`express.e:28577-28648`:

- `28597` `displayMenuPrompt()` draws the prompt.
- `28620` `SUBSTATE_READ_COMMAND` calls
  `lineInput('','',255,INPUT_TIMEOUT,commandText)` - **the BBS reads the
  whole line itself**.
- `28647` `SUBSTATE_PROCESS_COMMAND` calls `processCommand(commandText)` -
  the first point a door is reached.

No hook, no callback, no door type invoked during input. A door is handed a
finished command, never a keystroke.

Three related facts from the same read:

- `lineInput` (`2170`) is already a line editor: history on up/down
  (`historyBuf`), CTRL-B, CTRL-X, cursor movement. The machinery an
  autocompleting prompt needs is already there.
- **TAB is unused.** `lineInput` has no TAB case and printable characters
  require `ch > 31`, so TAB is dropped today. Nothing breaks by giving it a
  meaning.
- `processCommand` (`28229`) splits on the first space into one command and
  its parameters. No separator, so nothing can chain "run X then reopen me".
- A `.keys` file beside a MENU screen (`6567-6574`) switches the prompt to
  single-key mode (`translateShortcut`, `28434`, TAB included). A static
  map, and it replaces line input entirely - nothing can be typed.

### The decision

**No menu.** A door that opens a palette was considered and rejected by the
sysop: the point is the PROMPT completing as you type, not a second screen
to go to.

**The shape, in the sysop's words:** "just a discreet auto fill/complete
with dark grey that you can tab to complete words in the prompt."

So, concretely:

- The rest of the best match appears **inline, after the cursor, in dark
  grey** - it must read as an offer, not as text that has been typed. The
  prompt otherwise looks exactly as it does now.
- **TAB accepts it**, completing the word. TAB is the right key on both
  targets: it is unused in `lineInput` today (see above), so on the Amiga
  side it is purely additive.
- Nothing pops up. No list, no box, no second screen, and nothing moves
  when there is no match - the grey tail simply is not there.
- Typing continues normally; the ghost follows what has been typed and
  disappears the moment it stops matching.

This is the LIVECHAT/DoorRepo ghost text without the dropdown that
accompanies it there - `flow_command_ghost` already computes exactly this
string, and deliberately returns nothing when the typed letters only appear
in the MIDDLE of a command, because completing there would put a word on
the line that was never asked for.

- **Web port: build it in TypeScript, inline at the prompt.** The web BBS
  owns its own input handling, so completion belongs there - the same shape
  a shell has, with the command list coming from the same command cache
  dispatch already reads. No door involved.
- **Real Amiga: for Phantasm.** The change is to `lineInput` - give TAB a
  meaning and complete against the command directories. TAB being free
  makes it additive: no existing key changes behaviour. Worth handing over
  with the line numbers above.

Not started, and not urgent.

### If it is picked up, the pieces that already exist

The completion RULES are written and tested in C
(`flow_command_suggest`, `flow_command_ghost`, `examples/doorrepo-c/flow.c`):
what the typed letters START comes before what merely contains them, and a
line with a space in it is an argument rather than a verb. A TypeScript
implementation should match those rules rather than invent its own, and the
C tests are the specification.

Open questions for whoever builds it:

1. **Which commands.** express.e's own precedence: CONFCMD > NODECMD >
   BBSCMD (`4630-4647`), plus internal commands, which are not files
   (`4732`).
2. **Access filtering.** Only offer what the user may run - `express.e:4703`
   reads ACCESS=0 as DENIED. Offering a command that then refuses is worse
   than not offering it.
3. **What to show beside a name.** MENUNAME from the .info; DoorRepo's `T`
   screen already edits it.
