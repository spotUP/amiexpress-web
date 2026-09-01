---
date: 2026-09-01
topic: Themes across the doors, RIP graphics that draw, and a day of backend parity fixes
tags: [themes, sdk, doors, rip, terminal, backend, handoff]
status: final
---

# Handoff: themes, doors, RIP, and the A command

**Branch:** `feat/installed-door-link`. **19 commits today, none pushed.**
Pushing deploys; the sysop says "deploy" when ready.

## Tasks

1. Door theme system finished and applied - DONE, except the manual pass.
2. RIP graphics display - DONE (RIPtermJS), pending the sysop's eye.
3. A command, flag prompts, download exit, relogon, Global Wall, 42
   unresolvable requires - DONE.
4. The merge to main - BLOCKED (below).
5. DoorRepo "can't back out of subpages" - BLOCKED on a repro.

## Critical references

- `thoughts/shared/plans/2026-09-01-theme-borders-before-door-migration.md`
  - the border decision: `s.panel` may be borderless, `s.frame` never is.
- `thoughts/shared/research/2026-09-01_riptermjs-evaluation.md` - why
  RIPtermJS replaced our renderer, and what it costs.
- `sdk/engines/ui/theme/` - tokens, styles, chrome (`attachMasthead`,
  `footerHints`), glitches. `.js` extensions on the relative imports are
  REQUIRED (ESM doors) and jest maps them back off.
- `packages/terminal/src/rip/` - `RIPRenderer.tsx` wraps
  `vendor/ripterm.js` + `vendor/BGI.js` (MPL 2.0). Fonts/icons in
  `web/frontend/public/rip/`.
- `sdk/tests/unit/door-colour-migration.test.ts` - which doors are
  migrated and which are exempt, with reasons.
- `web/backend/tests/lazy-require-paths.test.ts` - every relative
  `require()` must resolve; caught 42.
- `Desktop/AmiExpress-68k-prompt-autocomplete-design.md` - for Phantasm.

## Recent changes (today, in order)

- blessed: selected row readable; mouse takes the cursor, no hover colour
- A command: six broken require paths; flag prompt line-buffered
  (`collectLine`), WAITING state split from done, Enter exits, (F)rom
  flags onward, conference 0 stays 0
- download exit and flag exit repaint the menu (`repaintMenuIfPending`)
- 42 unresolvable lazy requires fixed + sweep test; relogon reaches login
- Global Wall replies wrapped in `{success, data}`
- theme: `frame` role; dialogs take it; 8 doors migrated (322 literals),
  16 exempt; `attachMasthead` + `footerHints` shared; ESM barrel fixed
- RIP: renderer mounted, door keystroke bug, chunk boundaries, then the
  whole renderer replaced by RIPtermJS; files read as latin1
- mobile keyboard tests updated for the phone layout (7 were stale)

## Learnings

- **Restart after EVERY sdk/ edit, and rebuild the frontend after every
  packages/terminal edit.** Both bit today: `footerHints is not a
  function` was a 17:05 backend running 17:20 code; "no image" was a
  31 Aug frontend bundle. `--quick` skips frontend builds. The freshness
  protocol has no frontend step - it should.
- **Read the log before naming a cause.** Three of today's RIP guesses
  were wrong; the log had the answer each time.
- Node's ESM loader does not guess extensions. A tsc/CJS door hides it;
  an esbuild/ESM door (BUGS) dies on it.
- A RIP file is bytes; UTF-8 reads mangle CP437.
- React setState is asynchronous; a synchronous draw loop reading a ref
  synced from state paints everything in stale colours.
- `git add -u` in a shared tree sweeps the other session's work. By name
  only.
- Tests that assert on tag strings pass through rendering bugs; assert on
  painted bytes.
- express.e's `lineInput` blocks; every prompt ported from it needs
  line-buffering on the web side or it fires per keystroke.

## Artifacts

Plans/research above. Commits `462a6a8fc` .. `da7dc7bcb`.

## Next steps

1. Sysop: hard-reload, `RIP` -> `amigasp.RIP`; click a button if one
   draws. Then `DASHBOARD`, `BUGS`, `THEME`, `DOORMAN` under
   Quiet Phosphor and Classic (P4.3).
2. **Merge** when the other session commits (115 dirty files, in
   `ansi-editor.ts` and `cell-art/` as of 17:57). `origin/main` is 225
   commits diverged with 486 overlapping files, so it is a real merge:
   `git merge origin/main`, resolve, both suites, `git push origin
   HEAD:main`, then check the live container's image age.
3. DoorRepo back-out: needs which key was pressed. ESC is deliberately
   unbound (`doorrepo.c:2502`, cost DOORMAN six rounds); if that is it,
   the fix is a footer hint.
4. Optional: faint panel rules under the phosphor themes
   (`styles.ts`, `t.dim` instead of `t.ground`) if they still read plain.
5. RIP upstream gaps: filled ovals/pies, button label position.

## Other notes

- Sprite editor's active-tool highlight is theme accent now (`yellow`
  under classic, was `lightyellow`) - the one knowing change to classic.
- `web/frontend/public/rip/` is 2.2 MB of fonts and icons, committed.
- The RIPPipeline test uses our old parser on purpose: it proves real
  files yield drawable commands without needing a DOM canvas.
