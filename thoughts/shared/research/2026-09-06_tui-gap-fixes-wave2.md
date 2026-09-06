---
date: 2026-09-06
topic: TUI admin (dev/console) Significant/Inconvenient gap fixes, wave 2 - Admin Roles, Conferences, System/Session Logs, Screen Files, Nodes Configuration, Audit Log, File Checker errors, 401 handling
tags: [tui, admin, config-app, gap-fix, screens, node-config, audit-log, session-handling, file-checkers, conferences]
status: final
---

# TUI admin gap fixes, wave 2

Branch `fix/tui-gaps-wave2`, cut from origin/main at `78bc313ae` (after wave 1
landed). Fixes the nine Significant/Inconvenient items assigned, from
`thoughts/shared/research/2026-09-06_web-vs-tui-admin-gap-audit.md`. Ten
commits (nine features + one follow-up fix), each independently revertable:

| Commit | Item |
|---|---|
| `2c68c7092` | 1 - Admin Roles page |
| `464a32a37` | 2 - Conferences: create, delete, orphan-directory cleanup |
| `6b1ff01d6` | 3 - System Logs: server-side search, clear, door-log file listing |
| `a3fc094e5` | 4 - Session Logs: raw log fetch, save-to-file, stats |
| `b1967c13d` | 5 - Screen Files: revision history/restore, bulk repair |
| `5edc5245d` | 6 - Nodes: Configuration tab, and a CrudList text-entry-lock retrofit |
| `b9ca1f374` | 7 - Audit Log: record-id filter + the shared tableName/table bug |
| `6024818f1` | 8 - Lookup Tables: file-checker error sub-list |
| `8c4bee763` | 9 - 401/session handling |
| `6e35b694d` | follow-up - footer hotkey click-parsing recognises `#` |

All ten items from the assignment were completed - none were stopped on.
Item 5 turned out substantially larger than described (see its section);
finished anyway because the missing piece was genuinely buildable, not
impractical.

## Verification method (every item)

1. `npx tsc --noEmit` in `dev/console/` after every commit - clean throughout.
2. `npm test` in `dev/console/` after every commit - 42 tests passing at HEAD
   (11 at wave 1's close; +31 this wave), `node --test --import tsx
   src/**/*.test.ts`.
3. Read the corresponding web admin page/client method and backend route in
   full before writing the TUI equivalent - never inferred from the audit's
   summary alone.
4. Manual trace of each new key handler's state transitions against the
   ConfirmDialog/InlineEdit/CrudList/text-entry-lock patterns wave 1
   established.

`web/backend/` and `web/config-app/` were touched where the item required it
(items 5 and 7 - see below); this worktree has no installed `node_modules`
for either package (confirmed: `web/backend/node_modules/express` and
`web/config-app/node_modules` do not exist here), so those two edits could
not be type-checked directly. Both are small, single-purpose, low-risk
changes checked by careful reading against neighboring code in the same
file rather than a compiler - stated plainly rather than claimed otherwise.
Per the task's instruction, the full repo suite was not run.

## Item 1 - Admin Roles page (commit `2c68c7092`)

**What changed:** New `dev/console/src/components/tabs/AdminRolesPage.tsx`,
registered in `registry.ts` (People category, after Access Levels) and
`App.tsx`. Two new client methods, `getAdminPermissions`/
`setAdminPermissions`, hitting `/api/admin-permissions` directly (NOT under
`/api/config` - the one route in this whole client that isn't).

**Matched against:** `web/config-app/src/pages/AdminRolesPage.tsx` and
`web/config-app/src/api/client.ts:999-1013`. Same unwrapped `{ perms,
sections }` shape (this handler doesn't use the `{success,data}` envelope),
same dirty-gated save, same reset-to-defaults using each section's own
`defaultMinLevel` rather than a hardcoded value.

**Verified:** `tsc` clean, 2 new client tests (URL/method/body for both
calls).

## Item 2 - Conferences: create, delete, orphan cleanup (commit `464a32a37`)

**What changed:** `ConfsTab.tsx` gained `[a]dd` (an 8-field sequential form:
name/ndirs/min+max access level/force_newscan/exclude_ftp/private_conf/
read_only), `[d]elete` (typed confirmation of the conference id, THEN a
follow-up y/n for whether to also delete its files - ordered this way so an
accidental keypress on the files question can never skip the harder-to-fire
typed gate), and `[o]rphans` (a reviewable list of `Conf<n>` directories no
conference's LOCATION.n points at, each removable with a typed-confirmation
delete). Four new client methods: `createConference`, `deleteConference`,
`getOrphanConferenceDirs`, `removeOrphanConferenceDir`.

**Matched against:** `web/config-app/src/pages/ConferencesPage.tsx` and
`web/config-app/src/api/client.ts:473-513`. `conference_id` is never typed by
the sysop - the backend only accepts count+1
(`conference-config.service.ts:194-215`) - matching web's `handleAdd()`
computing it the same way. `removeFiles` is sent as a query flag, not a body
field, matching the backend's `req.query.removeFiles === 'true'` check
(`config-routes.ts:384-385`).

**Verified:** `tsc` clean, 5 new client tests.

## Item 3 - System Logs: search, clear, door-log listing (commit `6b1ff01d6`)

**What changed:** `getLogs` gained a `search` param and `getDoorLogFiles`/
`clearLogs` were added. `LogsTab.tsx`'s `[/]` filter now sends the term to
the server instead of filtering client-side over an already-loaded page;
`[L]` opens a picker over every `door-68k-*.log` file; `[C]` clears the
current log (confirms, names the target).

**Bug found and fixed while wiring this:** `getLogs` declared its return
type as the bare `{ lines, totalLines }` and returned the raw fetch response
directly, but `GET /api/config/logs` wraps its answer in `{success, data}`
like every other `/api/config/*` route
(`config-routes.ts:2159-2303`'s `sendResponse`). `.lines` was always
`undefined` - the log view had been rendering permanently empty regardless
of source or filter. Fixed by unwrapping `.data`.

**Matched against:** `web/config-app/src/api/client.ts:864-886`'s
`getLogs(type, lines, search, doorLog)`/`getDoorLogFiles`/`clearLogs` -
identical query params and DELETE-to-clear.

**Verified:** `tsc` clean, 4 new client tests (including the envelope-unwrap
regression).

## Item 4 - Session Logs: raw/save/stats (commit `a3fc094e5`)

**What changed:** `saveSessionLog`, `getSessionStats` added; `getSessionLog`
rewritten. `SessionLogsPage.tsx` gained a stats panel above the session list
(total sessions, total lines, oldest session) and `[s]ave` in the log view
(writes to disk, shows the returned path).

**Bug found and fixed while wiring this:** `getSessionLog` checked for a
`.data` field that `GET /api/sessions/:id/log`'s response never has -
`session-logs.handler.ts:36-60` answers a bare `{ log }`, not the
`{success,data}` envelope. It always fell through to returning the outer
`{log}` object, and the page read `.lines`/`.entries` off THAT - neither
exists; the real content is `.log.output`. Fixed to read `.log.output`
directly, matching `web/config-app/src/pages/SessionLogsPage.tsx:77`'s
`(logData as any)?.log` and its `sessionLog.output` usage.

Session output carries raw ANSI escapes (cursor moves, colour codes). A new
`dev/console/src/utils/strip-ansi.ts` (same shape as the `ansi-regex`
package, not added as a dependency) strips them for display - Ink's `<Text>`
doesn't interpret escape codes, it prints the literal bytes, which breaks
the TUI's own layout. `[s]ave` still writes the untouched original to disk,
matching the reasoning behind web's separate raw/stripped views
(`getSessionLogRaw` exists on the client for parity with web but the TUI
page doesn't call it - see "Not attempted" below).

**Verified:** `tsc` clean, 4 new client tests plus 3 for `stripAnsi` itself
(colour-code stripping, cursor-sequence stripping, plain-text passthrough).

## Item 5 - Screen Files: revisions/restore, bulk repair (commit `b1967c13d`)

**Larger than described - found and fixed the actual root cause.** The task
said "the web gained revision history recently - read how it stores and
restores before wiring the TUI to it." Investigating found that assumption
was false: `web/config-app/src/pages/ScreenRevisionsPanel.tsx` (the
revisions UI), the `getScreenRevisions`/`getScreenRevision`/
`restoreScreenRevision` client methods, and `web/backend/src/screens/
screen-revisions.ts` (the storage engine: `saveRevision`/`listRevisions`/
`readRevision`/`restoreRevision`) all existed - but:

- **No backend route reached the engine.** `GET /api/screens/revisions`,
  `GET /api/screens/revision`, `POST /api/screens/restore` did not exist
  anywhere in `screens-routes.ts` (confirmed by grep for `revisions`,
  `revision`, `restore` route registrations - zero hits outside the unused
  service file itself).
- **`saveRevision` was called nowhere** except recursively inside
  `restoreRevision`. `PUT /api/screens/file` never called it, so no revision
  was ever actually written on a real screen edit.
- **`ScreenRevisionsPanel.tsx` is never imported/rendered** anywhere in
  `web/config-app/src/` (confirmed by grep).

The whole subsystem was dead code end to end on the web side too, not a
working feature the TUI was simply missing. Fixed at the root rather than
worked around: `web/backend/src/api/screens-routes.ts` now calls
`saveRevision(target)` for each target before every overwrite in `PUT
/file`, and adds the three missing routes wired to the existing
`screen-revisions.ts` functions - matching the contract the web's own
(unwired) panel and client methods already declared, so both clients can use
it without a new shape being invented. **Not attempted:** wiring the web's
`ScreenRevisionsPanel.tsx` into its own `ScreenFilesPage.tsx` UI - that's
`web/config-app` UI work outside this task's TUI-parity scope, not attempted
here.

**TUI wiring:** `ScreenFilesPage.tsx` detail view gained `[h]istory` (lists
snapshots newest-first, `[v]` previews one via the existing `AnsiPreview`
component, `[r]` restores with a typed confirmation naming the file being
overwritten - the current content is snapshotted first, so a bad restore is
itself one revision away from undo). The main list gained `[R]epair all`
(dry run names every damaged file before a confirmed real pass, reported
per file) - this one endpoint (`POST /repair-all`) was ALREADY fully wired
and working on the backend; it had simply never been called from the TUI.

**Verified:** `tsc` clean (`dev/console` side); the backend route addition
could not be compiled in this worktree (no `web/backend/node_modules`) - read
carefully against the file's own existing routes (same `sendOk` wrapper,
same `resolveScreenPath`/`containedScreenPath` helpers) rather than
type-checked. 4 new client tests for the TUI-side methods.

## Item 6 - Nodes Configuration tab (commit `5edc5245d`)

**What changed:** New `NodesPage.tsx` wrapper (Live / Configuration tabs,
mirroring web's `NodeControlPage` + `NodesPage` split) and
`NodeConfigPage.tsx`, a `CrudList<NodeConfigRow>` over a dozen of
`NodeConfigSchema`'s 23 fields. `App.tsx`'s `nodes` entry now points at
`NodesPage` (which renders the existing `NodesTab` under its Live tab
unchanged).

**Deliberately reduced field set**, documented in the file: `node_start` (a
multi-line NODESTART block up to 4000 chars) and `nrams` (an array) don't
fit CrudList's single-line text editor at all; eight rarely-touched flags
(`sentby_files`, `keep_upload_credit`, `free_resuming`, `start_log`,
`ud_log`, `log_host`, `view_password`, `no_rad_boogie`) are left for the web
admin - the same trade-off wave 1's SecurityPage made porting ~90 ACS
permissions to a flat list, called out explicitly rather than silently
shipping less under the same name.

**Bug found and fixed while wiring this - CrudList never locked text
entry.** `CrudList` (shared by five existing lookup-table pages plus this
new one) had no `useTextEntryLock` call at all - its own search/edit/new/
delete-confirm modes could lose keystrokes to the sidebar's arrow-key page
cycling or the global `q`/`?` hotkeys. Wave 1's review flagged this as
"likely present, not retrofitted" since that wave only touched the four
pages it built. Fixed once in `CrudList` itself.

That fix then surfaced a second, one-level-up instance: three tab-bar
wrappers (`NodesPage` new, `ConferencesPage` and `LookupTablesPage`
existing) switch tabs on bare digit keypresses with no lock check - a
CrudList's own now-locked digit field (or ConfsTab's new create-form fields
from item 2) would still leak a keystroke to the WRAPPER and switch tabs out
from under the open form. Fixed in all three by gating each wrapper's
digit-switch `useInput` on `isTextEntryActive()`.

**Verified:** `tsc` clean, 4 new client tests (including that
`updateNodeConfig`/`deleteNodeConfig` key off `node_number` via the URL
path, not the synthesised `id` CrudList requires).

## Item 7 - Audit Log: record-id filter + shared bug (commit `b9ca1f374`)

**What changed:** Fixed the shared `tableName`→`table` param-name bug in
BOTH `dev/console/src/api/client.ts` and `web/config-app/src/api/client.ts`
- the backend reads `req.query.table` (`config-routes.ts:2012-2017`), but
both clients sent `tableName`, so the table filter matched nothing on every
request on both sides (the audit's own "bonus finding, affects both
equally"). Added `recordId` to `getAuditLog` (the backend already accepted
it; neither client exposed it). `AuditLogPage.tsx` gained `[#]` (record-id
filter, combinable with the existing `[/]` table filter) and now locks text
entry while either filter box is open - it previously collected free text
with no guard at all.

**Matched against:** `config-routes.ts:2012-2017` (the actual param name)
and `web/config-app/src/api/client.ts:826-836` (the same bug, now fixed
there too, per the task's explicit instruction to fix a genuinely shared
bug in both places).

**Verified:** `tsc` clean (dev/console side; web/config-app's single-line
fix could not be compiled here for the same node_modules reason as item 5).
2 new client tests.

## Item 8 - Lookup Tables: file-checker error sub-list (commit `6024818f1`)

**What changed:** `getFileCheckerErrors`/`createFileCheckerError`/
`deleteFileCheckerError` client methods added. `CrudList` gained a small,
generic `extraActions` prop (per-row single-key callbacks on top of the
built-in e/n/d///r) rather than a one-off widget grafted onto this one page
- `FileCheckersPage.tsx` uses it for `[E]`, which drills into a nested
`CrudList<FileCheckerErrorRow>` scoped to the selected checker (`[esc]`
backs out, gated on the nested list's own text-entry-lock state so it
doesn't fire while that list is mid-edit).

**Matched against:** `web/config-app/src/api/client.ts:779-794` and
`config-routes.ts:1578-1626` - including the asymmetric routing (create
nests under the checker, `POST /file-checkers/:id/errors`; delete is a flat
resource, `DELETE /file-checker-errors/:id`).

**Verified:** `tsc` clean, 3 new client tests.

## Item 9 - 401/session handling (commit `8c4bee763`)

**What changed:** `client.ts` gained `setUnauthorizedHandler()`/
`clearToken()`. `request()` now clears the stored token and calls the
registered handler on any 401, from any call, on any page. `useAuth`
registers it once (an effect with cleanup) and drops its own `token` state
to `null` with an explanatory message ("Session expired - please log in
again.") - which is exactly what already makes `index.tsx`'s `Root` swap
from `<App>` back to `<LoginPrompt>` (it renders `App` only while a token
exists). No page needed to be touched; none invented its own handling.

**Matched against:** the pattern web's `AuthContext` establishes (401 →
re-login), adapted to this TUI's much simpler single-hook auth state rather
than porting a full refresh-token flow the backend's TUI-facing auth doesn't
support anyway (`login()` here has no refresh token handling either, before
or after this change).

**Verified:** `tsc` clean, 2 new client tests (a 401 clears the token and
fires the handler exactly once; a 400 does neither).

## Follow-up - footer hotkey click-parsing recognises `#` (commit `6e35b694d`)

Found while finishing item 7: `useHotkeyClick.ts`'s `parseHotkeys` character
class didn't include `#`, so the new `[#]` filter hint wasn't clickable from
the footer bar (the keyboard shortcut itself worked regardless - this only
affected mouse click-to-dispatch). One-character fix.

## Files touched

- `dev/console/src/api/client.ts`
- `dev/console/src/api/client.test.ts`
- `dev/console/src/api/types.ts`
- `dev/console/src/App.tsx`
- `dev/console/src/hooks/useAuth.ts`
- `dev/console/src/hooks/useHotkeyClick.ts`
- `dev/console/src/pages/registry.ts`
- `dev/console/src/components/CrudList.tsx`
- `dev/console/src/components/tabs/AdminRolesPage.tsx` (new)
- `dev/console/src/components/tabs/AuditLogPage.tsx`
- `dev/console/src/components/tabs/ConferencesPage.tsx`
- `dev/console/src/components/tabs/ConfsTab.tsx`
- `dev/console/src/components/tabs/FileCheckersPage.tsx`
- `dev/console/src/components/tabs/LogsTab.tsx`
- `dev/console/src/components/tabs/LookupTablesPage.tsx`
- `dev/console/src/components/tabs/NodeConfigPage.tsx` (new)
- `dev/console/src/components/tabs/NodesPage.tsx` (new)
- `dev/console/src/components/tabs/ScreenFilesPage.tsx`
- `dev/console/src/components/tabs/SessionLogsPage.tsx`
- `dev/console/src/utils/strip-ansi.ts` (new)
- `dev/console/src/utils/strip-ansi.test.ts` (new)
- `web/backend/src/api/screens-routes.ts` (item 5's route additions)
- `web/config-app/src/api/client.ts` (item 7's shared param-name fix)

## Not attempted / explicitly out of scope

- Sprite Manager, door archive upload, the `timeLimit`/`expert` parity bug,
  and the dead `security_level_access` routes - all explicitly excluded by
  the task.
- Wiring web's `ScreenRevisionsPanel.tsx` into its own `ScreenFilesPage.tsx`
  - discovered as dead code while doing item 5, but fixing web's own UI is
  outside a TUI-parity task.
- `getSessionLogRaw` exists on the TUI client (added for contract parity
  with web) but no TUI page calls it - the stripped display plus `[s]ave`
  already cover "read it" and "get the exact bytes" without a raw-ANSI
  render mode the terminal can't safely show anyway.
- Full field parity on Node Configuration (`node_start`, `nrams`, eight
  rarely-touched flags) - documented reduction, not a silent one.

## Final verification

```
cd dev/console && npx tsc --noEmit   # clean
cd dev/console && npm test           # 42 pass, 0 fail
```

Both clean at HEAD (`6e35b694d`).
